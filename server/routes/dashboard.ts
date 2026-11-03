import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// GET /api/v1/dashboard/summary
dashboardRouter.get('/summary', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const summary = await db.getDashboardMetrics(userId);
    return res.json({ summary });
  } catch (err: any) {
    console.error('[Dashboard] summary error:', err);
    return res.status(500).json({ error: 'Failed to retrieve dashboard metrics.' });
  }
});

// GET /api/v1/dashboard/upcoming-expiries
dashboardRouter.get('/upcoming-expiries', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const summary = await db.getDashboardMetrics(userId);
    return res.json({ upcoming: summary.upcoming_expiries });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve upcoming expiries.' });
  }
});
