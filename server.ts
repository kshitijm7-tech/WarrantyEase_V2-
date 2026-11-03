// Loaded first on purpose: modules below read process.env at import time, and
// ES module imports are evaluated before this file's body, so a dotenv.config()
// call further down would run too late for them.
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './server/db.js';
import { storage } from './server/storage.js';
import { authRouter } from './server/routes/auth.js';
import { warrantiesRouter } from './server/routes/warranties.js';
import { documentsRouter } from './server/routes/documents.js';
import { notificationsRouter } from './server/routes/notifications.js';
import { dashboardRouter } from './server/routes/dashboard.js';
import { ocrRouter } from './server/routes/ocr.js';
import { generateDueNotificationsForAllUsers, requireCronSecret } from './server/reminders.js';
import { authConfig } from './server/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Initialize database schema (runs pending migrations)
  await db.init();

  // Standard middleware
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Health check endpoints
  const healthHandler = (req: express.Request, res: express.Response) => {
    res.json({
      status: 'healthy',
      app: 'WarrantyEase',
      version: '1.0.0',
      database: db.isPostgres ? 'PostgreSQL' : 'Local SQLite (development fallback)',
      storage: storage.isS3 ? 'Private S3 bucket' : 'Local disk (development fallback)',
      auth: authConfig.clerk_enabled ? 'clerk' : authConfig.local_auth ? 'local' : 'disabled',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  // Scheduled reminder trigger, protected by CRON_SECRET. The platform cron job
  // may call it with either method, so both are registered on the same handler.
  const cronReminderHandler = async (_req: express.Request, res: express.Response) => {
    try {
      const result = await generateDueNotificationsForAllUsers();
      console.log('[Cron] Reminder run:', JSON.stringify(result));
      res.json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('[Cron] Reminder run failed:', err);
      res.status(500).json({ success: false, error: 'Reminder generation failed.' });
    }
  };
  app.post('/api/v1/cron/reminders', requireCronSecret, cronReminderHandler);
  app.get('/api/v1/cron/reminders', requireCronSecret, cronReminderHandler);

  // Mount API routers under /api/v1
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/warranties', warrantiesRouter);
  app.use('/api/v1/documents', documentsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/ocr', ocrRouter);

  // Serve Frontend
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // dist-server/server.js lives beside dist/, so resolve from the project root
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[WarrantyEase] Server listening on http://${HOST}:${PORT}`);
    console.log(`[WarrantyEase] Database: ${db.isPostgres ? 'PostgreSQL' : 'SQLite'}`);
    console.log(`[WarrantyEase] Storage: ${storage.isS3 ? 'AntiDeploy S3 Bucket' : 'Local Secure Vault'}`);
  });
}

startServer().catch((err) => {
  console.error('[WarrantyEase] Startup error:', err);
  process.exit(1);
});
