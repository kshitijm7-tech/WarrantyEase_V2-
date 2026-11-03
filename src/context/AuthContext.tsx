import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  ClerkProvider,
  useUser as useClerkUser,
  useAuth as useClerkAuth,
  useClerk,
} from '@clerk/clerk-react';
import { api, setAuthToken, User } from '../api';

const CLERK_PUBLISHABLE_KEY =
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) || '';

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

/**
 * Internal Auth bridge that synchronizes Clerk user session with backend PostgreSQL
 */
function ClerkAuthBridge({ children, demoMode }: { children: React.ReactNode; demoMode: boolean }) {
  const { user: clerkUser, isLoaded: isClerkLoaded, isSignedIn } = useClerkUser();
  const { getToken } = useClerkAuth();
  const clerk = useClerk();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync Clerk session to backend
  useEffect(() => {
    async function syncSession() {
      if (!isClerkLoaded) return;

      if (isSignedIn && clerkUser) {
        try {
          const token = await getToken();
          setAuthToken(token);

          const email =
            clerkUser.primaryEmailAddress?.emailAddress || `${clerkUser.id}@clerk.user`;
          const name = clerkUser.fullName || clerkUser.firstName || 'Clerk User';

          const res = await api.syncClerkUser(name, email);
          setUser(res.user);
        } catch (err) {
          console.error('[Clerk] Failed to sync session with backend:', err);
          setUser({
            id: clerkUser.id,
            name: clerkUser.fullName || clerkUser.firstName || 'User',
            email: clerkUser.primaryEmailAddress?.emailAddress || '',
            created_at: new Date().toISOString(),
          });
        } finally {
          setLoading(false);
        }
      } else {
        // Not signed in via Clerk, check if local/demo session is active
        try {
          const res = await api.getMe();
          setUser(res.user);
        } catch {
          setUser(null);
          setAuthToken(null);
        } finally {
          setLoading(false);
        }
      }
    }

    syncSession();
  }, [isClerkLoaded, isSignedIn, clerkUser]);

  const refreshUser = async () => {
    if (isSignedIn && clerkUser) {
      const token = await getToken();
      setAuthToken(token);
      const res = await api.getMe();
      setUser(res.user);
    } else {
      const res = await api.getMe();
      setUser(res.user);
    }
  };

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    setUser(res.user);
  };

  const register = async (name: string, email: string, pass: string) => {
    const res = await api.register(name, email, pass);
    setUser(res.user);
  };

  const logout = async () => {
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
 * Standard Auth Provider when Clerk key is not set
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
    setUser(res.user);
  };

  const register = async (name: string, email: string, pass: string) => {
    const res = await api.register(name, email, pass);
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

/**
 * The demo account seeds sample records, so it is only offered when the server
 * reports DEMO_MODE. Keeping the flag server-side avoids a dead button in
 * production, where the endpoint is disabled.
 */
function useDemoMode(): boolean {
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/auth/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        if (!cancelled && config) setDemoMode(Boolean(config.demo_mode));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return demoMode;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const demoMode = useDemoMode();

  if (CLERK_PUBLISHABLE_KEY && CLERK_PUBLISHABLE_KEY.startsWith('pk_')) {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <ClerkAuthBridge demoMode={demoMode}>{children}</ClerkAuthBridge>
      </ClerkProvider>
    );
  }

  return <LocalAuthProvider demoMode={demoMode}>{children}</LocalAuthProvider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
