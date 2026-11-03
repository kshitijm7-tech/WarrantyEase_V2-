import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { verifyToken as verifyClerkToken } from '@clerk/backend';
import { db, User } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'warrantyease_default_secure_secret_2026';

export interface AuthenticatedRequest extends Request {
  user?: User;
  authSource?: 'clerk' | 'jwt';
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: { id: string; email: string; name: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyLocalToken(token: string): { id: string; email: string; name: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string; name: string };
  } catch (err) {
    return null;
  }
}

/**
 * Server-side authentication middleware:
 * 1. Checks Bearer token for verified Clerk session (via CLERK_SECRET_KEY and @clerk/backend).
 * 2. If Clerk is configured and valid, securely associates the request with the stable Clerk user ID.
 * 3. Falls back seamlessly to local secure JWT token for demo/local evaluation.
 * 4. Ensures strict user isolation on every single request.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let bearerToken: string | undefined;
  let cookieToken: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    bearerToken = req.headers.authorization.slice(7).trim();
  }
  if (req.cookies && req.cookies.warrantyease_token) {
    cookieToken = req.cookies.warrantyease_token;
  }

  const token = bearerToken || cookieToken;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  // 1. Attempt Clerk Token Verification if Bearer token and CLERK_SECRET_KEY exist
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (bearerToken && clerkSecretKey) {
    try {
      const verifiedClerk = await verifyClerkToken(bearerToken, {
        secretKey: clerkSecretKey,
      });

      if (verifiedClerk && verifiedClerk.sub) {
        const clerkUserId = verifiedClerk.sub;
        const email = (verifiedClerk as any).email || (verifiedClerk as any).email_address || `${clerkUserId}@clerk.user`;
        const name = (verifiedClerk as any).name || (verifiedClerk as any).first_name || 'Clerk User';

        // Synchronize verified Clerk user to database
        const user = await db.upsertClerkUser(clerkUserId, email, name);
        req.user = user;
        req.authSource = 'clerk';
        return next();
      }
    } catch (clerkErr: any) {
      // Log failure and fall through to check local token
      // console.warn('[Auth] Clerk token verification failed:', clerkErr.message);
    }
  }

  // 2. Local JWT Token Verification (Fallback / Demo mode)
  const localPayload = verifyLocalToken(token);
  if (localPayload) {
    try {
      let user = await db.getUserById(localPayload.id);
      if (!user) {
        // If user was created by demo session with custom clerk-style ID
        user = await db.upsertClerkUser(localPayload.id, localPayload.email, localPayload.name);
      }
      req.user = user;
      req.authSource = 'jwt';
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to authenticate user.' });
    }
  }

  return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
}
