import { Router, Response } from 'express';
import { db } from '../db.js';
import { hashPassword, comparePassword, generateToken, requireAuth, AuthenticatedRequest } from '../auth.js';
import { calculateExpiryDate } from '../../src/utils/warranty.js';

export const authRouter = Router();

function setTokenCookie(res: Response, token: string) {
  res.cookie('warrantyease_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

authRouter.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.createUser(name.trim(), normalizedEmail, passwordHash);

    const token = generateToken({ id: user.id, email: user.email, name: user.name });
    setTokenCookie(res, token);

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
      },
      token,
    });
  } catch (err: any) {
    console.error('[Auth] Registration error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await db.getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await comparePassword(String(password), user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name });
    setTokenCookie(res, token);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
      },
      token,
    });
  } catch (err: any) {
    console.error('[Auth] Login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('warrantyease_token', { path: '/' });
  return res.json({ success: true, message: 'Signed out successfully.' });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at,
    },
  });
});

authRouter.patch('/settings', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Display name cannot be empty.' });
    }
    const updated = await db.updateUser(req.user!.id, name.trim());
    return res.json({
      user: {
        id: updated?.id,
        name: updated?.name,
        email: updated?.email,
        created_at: updated?.created_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
});

authRouter.post('/sync-clerk', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { name, email } = req.body;
  if (req.user) {
    const updated = await db.upsertClerkUser(req.user.id, email || req.user.email, name || req.user.name);
    return res.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        created_at: updated.created_at,
      },
    });
  }
  return res.status(401).json({ error: 'Unauthorized' });
});

// Demo account provisioner for interactive product preview
authRouter.post('/demo', async (req, res) => {
  try {
    const demoEmail = 'demo@warrantyease.app';
    let user = await db.getUserByEmail(demoEmail);

    if (!user) {
      const passwordHash = await hashPassword('demo123456');
      user = await db.createUser('Alex Morgan', demoEmail, passwordHash);

      // Seed realistic demo warranties
      const now = new Date();
      const formatYMD = (d: Date) => d.toISOString().split('T')[0];

      // 1. Apple MacBook Pro (Active, ~8 months left)
      const p1Date = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
      const w1 = await db.createWarranty(user.id, {
        product_name: 'Apple MacBook Pro 14" M3 Pro',
        brand: 'Apple',
        category: 'Electronics',
        model_number: 'MRX33HN/A',
        serial_number: 'C02G99XYZ123',
        purchase_date: formatYMD(p1Date),
        purchase_price: 199900,
        currency: 'INR',
        warranty_duration_months: 12,
        expiry_date: calculateExpiryDate(formatYMD(p1Date), 12),
        seller: 'Apple Store India',
        notes: 'Covered under AppleCare standard 1-year limited warranty. Keep original box for service claims.',
      });

      // 2. Sony Noise-Cancelling Headphones (Expiring in ~14 days)
      const p2Date = new Date(now.getTime() - (365 - 14) * 24 * 60 * 60 * 1000);
      const w2 = await db.createWarranty(user.id, {
        product_name: 'Sony WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        category: 'Audio',
        model_number: 'WH-1000XM5/BM',
        serial_number: 'SNY-8842109',
        purchase_date: formatYMD(p2Date),
        purchase_price: 29990,
        currency: 'INR',
        warranty_duration_months: 12,
        expiry_date: calculateExpiryDate(formatYMD(p2Date), 12),
        seller: 'Croma Electronics',
        notes: 'Includes replacement warranty for headband cushion and battery issues.',
      });

      // 3. Samsung 34" Curved Gaming Monitor (Expired 45 days ago)
      const p3Date = new Date(now.getTime() - 410 * 24 * 60 * 60 * 1000);
      await db.createWarranty(user.id, {
        product_name: 'Samsung Odyssey G5 34" Ultra-Wide',
        brand: 'Samsung',
        category: 'Monitors',
        model_number: 'LC34G55TWWWXXL',
        serial_number: 'SAM-MON-5592',
        purchase_date: formatYMD(p3Date),
        purchase_price: 38500,
        currency: 'INR',
        warranty_duration_months: 12,
        expiry_date: calculateExpiryDate(formatYMD(p3Date), 12),
        seller: 'Amazon India',
        notes: 'Standard 1-year manufacturer warranty expired. Out-of-warranty repairs available at Samsung authorized centers.',
      });

      // 4. Dyson V12 Detect Slim Vacuum (Active, 18 months left)
      const p4Date = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      await db.createWarranty(user.id, {
        product_name: 'Dyson V12 Detect Slim Cordless Vacuum',
        brand: 'Dyson',
        category: 'Appliances',
        model_number: 'V12-SLIM-GOLD',
        serial_number: 'DYS-7731889',
        purchase_date: formatYMD(p4Date),
        purchase_price: 55900,
        currency: 'INR',
        warranty_duration_months: 24,
        expiry_date: calculateExpiryDate(formatYMD(p4Date), 24),
        seller: 'Dyson India Official',
        notes: '2-year comprehensive coverage on motor and battery. Free doorstep pickup.',
      });

      // Create a sample notification for the expiring Sony headphones
      await db.createNotificationIfNotExists(
        user.id,
        w2.id,
        '30_days',
        'Reminder: Warranty for Sony WH-1000XM5 Wireless Headphones expires soon.',
        `${user.id}:${w2.id}:30_days`
      );
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name });
    setTokenCookie(res, token);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
      },
      token,
      message: 'Demo account signed in successfully.',
    });
  } catch (err: any) {
    console.error('[Auth] Demo login error:', err);
    return res.status(500).json({ error: 'Failed to initialize demo account.' });
  }
});
