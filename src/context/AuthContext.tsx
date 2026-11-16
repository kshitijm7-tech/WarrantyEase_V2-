import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  ClerkProvider,
  useUser as useClerkUser,
  useAuth as useClerkAuth,
  useClerk,
} from '@clerk/clerk-react';
import { api, setAuthToken, setTokenProvider, User } from '../api';

// Publishable Clerk keys are public by design. The server reports the key it
// actually trusts, which also covers builds made without a key in their env.
const BUILD_CLERK_PUBLISHABLE_KEY = (
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) || ''
).trim();

export interface ClientAuthConfig {
  clerk_enabled: boolean;
  clerk_publishable_key: string | null;
  clerk_environment: 'development' | 'production' | null;
  local_auth: boolean;
  demo_mode: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isClerkEnabled: boolean;
  demoMode: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  loginDemo: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthBootSplash() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 animate-spin flex items-center justify-center text-white font-bold text-xs">
          WE
        </div>
        <span className="text-xs text-slate-500 font-medium">Starting WarrantyEase...</span>
      </div>
    </div>
  );
}

/**
 * The server owns the decision of which sign-in method this deployment can
 * actually verify, so the UI never offers a method that cannot work.
 *
 * A Clerk *development* instance only authenticates the developer's own browser
 * (it requires a Clerk dashboard "dev browser" cookie) and clerk-js otherwise
 * redirects visitors into the Clerk dashboard. On a deployed domain that leaves
 * people stuck right after signing in, so such deployments fall back to the
 * server-verified email + password session instead.
 */
function useServerAuthConfig(): ClientAuthConfig | null {
  const [config, setConfig] = useState<ClientAuthConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/auth/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setConfig(
          data
            ? {
                clerk_enabled: Boolean(data.clerk_enabled),
                clerk_publishable_key: data.clerk_publishable_key || null,
                clerk_environment: data.clerk_environment || null,
                local_auth: Boolean(data.local_auth),
                demo_mode: Boolean(data.demo_mode),
              }
            : {
                clerk_enabled: false,
                clerk_publishable_key: null,
                clerk_environment: null,
                local_auth: true,
                demo_mode: false,
              }
        );
      })
      .catch(() => {
        if (cancelled) return;
        setConfig({
          clerk_enabled: false,
          clerk_publishable_key: null,
          clerk_environment: null,
          local_auth: true,
          demo_mode: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}

/**
 * Internal Auth bridge that synchronizes the Clerk session with backend PostgreSQL
 */
function ClerkAuthBridge({ children, demoMode }: { children: React.ReactNode; demoMode: boolean }) {
  const { user: clerkUser, isLoaded: isClerkLoaded, isSignedIn } = useClerkUser();
  const { getToken } = useClerkAuth();
  const clerk = useClerk();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Clerk session tokens are short lived (~60s). A token captured once at
  // sign-in would make every later request fail with 401, so the API client
  // asks for a fresh token on each call instead.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!isSignedIn) {
      setTokenProvider(null);
      return;
    }
    setTokenProvider(async () => {
      try {
        return await getTokenRef.current();
      } catch {
        return null;
      }
    });
    return () => setTokenProvider(null);
  }, [isSignedIn]);

  // Sync Clerk session to backend
  useEffect(() => {
    let cancelled = false;

    async function syncSession() {
      if (!isClerkLoaded) return;

      if (!isSignedIn || !clerkUser) {
        // Not signed in via Clerk: keep a local/cookie session if one exists.
        try {
          const res = await api.getMe();
          if (!cancelled) setUser(res.user);
        } catch {
          if (!cancelled) {
            setUser(null);
            setAuthToken(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      const email =
        clerkUser.primaryEmailAddress?.emailAddress || `${clerkUser.id}@clerk.user`;
      const name = clerkUser.fullName || clerkUser.firstName || 'Clerk User';

      try {
        const token = await getTokenRef.current();
        setAuthToken(token);

        const res = await api.syncClerkUser(name, email);
        if (!cancelled) setUser(res.user);
      } catch (err) {
        console.error('[Clerk] Failed to sync session with backend:', err);
        if (!cancelled) {
          setUser({
            id: clerkUser.id,
            name,
            email,
            created_at: new Date().toISOString(),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    syncSession();
    return () => {
      cancelled = true;
    };
  }, [isClerkLoaded, isSignedIn, clerkUser]);

  const refreshUser = async () => {
    const res = await api.getMe();
    setUser(res.user);
  };

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    setAuthToken(res.token);
    setUser(res.user);
  };

  const register = async (name: string, email: string, pass: string) => {
    const res = await api.register(name, email, pass);
    setAuthToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    setTokenProvider(null);
    if (isSignedIn) {
      await clerk.signOut();
    }
    await api.logout();
    setAuthToken(null);
    setUser(null);
  };

  const loginDemo = async () => {
    const res = await api.loginDemo();
    setUser(res.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: !isClerkLoaded || loading,
        isClerkEnabled: true,
        demoMode,
        login,
        register,
        logout,
        loginDemo,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Server-verified email + password session (httpOnly cookie). Used when the
 * deployment's Clerk instance is not usable from a public origin.
 */
function LocalAuthProvider({ children, demoMode }: { children: React.ReactNode; demoMode: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
    } catch {
      setUser(null);
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    setAuthToken(res.token);
    setUser(res.user);
  };

  const register = async (name: string, email: string, pass: string) => {
    const res = await api.register(name, email, pass);
    setAuthToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    await api.logout();
    setAuthToken(null);
    setUser(null);
  };

  const loginDemo = async () => {
    const res = await api.loginDemo();
    setUser(res.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isClerkEnabled: false,
        demoMode,
        login,
        register,
        logout,
        loginDemo,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const config = useServerAuthConfig();

  if (!config) return <AuthBootSplash />;

  const publishableKey = (config.clerk_publishable_key || BUILD_CLERK_PUBLISHABLE_KEY).trim();
  const expectedPrefix = config.clerk_environment === 'production' ? 'pk_live_' : 'pk_test_';
  // A key the server supplies is authoritative; otherwise trust the built key,
  // which is always from the same instance as the configured secret key.
  const keyMatches =
    publishableKey.startsWith('pk_') &&
    (config.clerk_publishable_key ? publishableKey.startsWith(expectedPrefix) : true);

  if (config.clerk_enabled && keyMatches) {
    return (
      <ClerkProvider publishableKey={publishableKey}>
        <ClerkAuthBridge demoMode={config.demo_mode}>{children}</ClerkAuthBridge>
      </ClerkProvider>
    );
  }

  return <LocalAuthProvider demoMode={config.demo_mode}>{children}</LocalAuthProvider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
