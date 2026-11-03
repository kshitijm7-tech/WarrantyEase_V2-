import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';
import { generateDueNotificationsForUser } from '../reminders.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// GET /api/v1/notifications
notificationsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { items, unreadCount } = await db.getNotifications(userId);
    return res.json({ notifications: items, unread_count: unreadCount });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// PATCH /api/v1/notifications/:id/read
notificationsRouter.patch('/:id/read', async (req: AuthenticatedRequest, res) => {
  try {
    const success = await db.markNotificationRead(req.params.id, req.user!.id);
    if (!success) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch {
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// POST /api/v1/notifications/read-all
notificationsRouter.post('/read-all', async (req: AuthenticatedRequest, res) => {
  try {
    const markedCount = await db.markAllNotificationsRead(req.user!.id);
    return res.json({ success: true, marked_count: markedCount });
  } catch {
    return res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

// POST /api/v1/notifications/generate-due
// Manual action: evaluates 30/7/1/0-day windows for this account only.
notificationsRouter.post('/generate-due', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const created = await generateDueNotificationsForUser(userId);
    const { items, unreadCount } = await db.getNotifications(userId);

    return res.json({
      success: true,
      new_notifications_count: created,
      total_unread: unreadCount,
      notifications: items,
      message:
        created > 0
          ? `Created ${created} new reminder${created === 1 ? '' : 's'}.`
          : 'No new reminders were due; existing reminders are already up to date.',
    });
  } catch (err) {
    console.error('[Notifications] generate-due error:', err);
    return res.status(500).json({ error: 'Failed to generate due notifications.' });
  }
});
