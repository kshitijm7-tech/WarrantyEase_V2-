import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { verifyToken as verifyClerkToken } from '@clerk/backend';
import { db, User } from './db.js';

const CLERK_SECRET_KEY = (process.env.CLERK_SECRET_KEY || '').trim();

/**
 * A published Clerk secret key looks like `sk_test_<long>` / `sk_live_<long>`.
 * `.env.example` ships the literal placeholder `sk_test_...`, which must never be
 * treated as a configured key (it would send every request down a dead Clerk path).
 */
export const CLERK_CONFIGURED =
  /^sk_(test|live)_[A-Za-z0-9]{16,}$/.test(CLERK_SECRET_KEY);

/**
 * Local email + password auth exists for evaluation and local development only.
 * It is enabled by default just while Clerk is unconfigured, and can be forced
 * off in any environment with ALLOW_LOCAL_AUTH=false.
 */
export const ALLOW_LOCAL_AUTH = process.env.ALLOW_LOCAL_AUTH
  ? process.env.ALLOW_LOCAL_AUTH === 'true'
  : !CLERK_CONFIGURED;

export const DEMO_MODE = process.env.DEMO_MODE === 'true';

export const authConfig = {
  clerk_enabled: CLERK_CONFIGURED,
  local_auth: ALLOW_LOCAL_AUTH,
  demo_mode: DEMO_MODE,
};

// The platform generates JWT_SECRET in the deployed container. Outside the
// platform we generate a random per-process secret rather than shipping a
// hardcoded one, so a missing variable never means "everyone knows the key".
const JWT_SECRET: string =
  process.env.JWT_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const JWT_COOKIE = 'warrantyease_token';

export interface AuthenticatedRequest extends Request {
  user?: User;
  authSource?: 'clerk' | 'local';
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: { id: string; email: string; name: string }): string {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyLocalToken(token: string): { id: string; email: string; name: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string; name: string };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(JWT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(JWT_COOKIE, { path: '/' });
}

/**
 * Server-side authentication for every private endpoint.
 *
 * 1. A Bearer token is verified against Clerk when Clerk is configured. The
 *    stable Clerk user id (`sub`) becomes the ownership id; nothing supplied by
 *    the browser is trusted for identity.
 * 2. The httpOnly session cookie (or Bearer token) is verified as a local JWT
 *    only while local auth is enabled.
 * A request that satisfies neither is rejected with 401.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const bearerToken =
    req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined;
  const cookieToken = req.cookies ? (req.cookies[JWT_COOKIE] as string | undefined) : undefined;

  if (!bearerToken && !cookieToken) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  // --- Clerk-verified session ---
  if (CLERK_CONFIGURED && bearerToken) {
    try {
      const claims = await verifyClerkToken(bearerToken, { secretKey: CLERK_SECRET_KEY });
      const clerkUserId = claims?.sub;
      if (clerkUserId) {
        const claim = claims as Record<string, unknown>;
        const email =
          (typeof claim.email === 'string' && claim.email) ||
          (typeof claim.email_address === 'string' && claim.email_address) ||
          `${clerkUserId}@clerk.user`;
        const name =
          (typeof claim.name === 'string' && claim.name) ||
          [claim.first_name, claim.last_name].filter((p) => typeof p === 'string').join(' ') ||
          'Clerk User';

        const user = await db.upsertClerkUser(clerkUserId, email, name);
        req.user = user;
        req.authSource = 'clerk';
        return next();
      }
    } catch {
      // Invalid/expired Clerk token: fall through to an explicit 401 below.
      if (!ALLOW_LOCAL_AUTH) {
        return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      }
    }
  }

  // --- Local evaluation session ---
  if (ALLOW_LOCAL_AUTH) {
    const candidate = bearerToken || cookieToken;
    const payload = candidate ? verifyLocalToken(candidate) : null;
    if (payload) {
      try {
        const user = (await db.getUserById(payload.id)) || (await db.getUserByEmail(payload.email));
        if (user) {
          req.user = user;
          req.authSource = 'local';
          return next();
        }
      } catch {
        return res.status(500).json({ error: 'Failed to authenticate user.' });
      }
    }
  }

  return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
}

/** True when the request carries any session this server can verify. */
export async function hasValidSession(req: AuthenticatedRequest): Promise<boolean> {
  let ok = false;
  await requireAuth(req, {} as Response, () => {
    ok = true;
  }).catch(() => undefined);
  return ok;
}
