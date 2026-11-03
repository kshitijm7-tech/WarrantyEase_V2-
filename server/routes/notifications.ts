import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';
import { getRemainingDays, formatDateDisplay, buildDeduplicationKey } from '../../src/utils/warranty.js';

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
    const userId = req.user!.id;
    const { id } = req.params;

    const success = await db.markNotificationRead(id, userId);
    if (!success) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// POST /api/v1/notifications/read-all
notificationsRouter.post('/read-all', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const updatedCount = await db.markAllNotificationsRead(userId);
    return res.json({ success: true, marked_count: updatedCount });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

// POST /api/v1/notifications/generate-due
// Scans active warranties for 30d, 7d, 1d, and 0d expiry intervals and generates deduplicated alerts
notificationsRouter.post('/generate-due', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const warranties = await db.getWarranties(userId);

    let newlyCreated = 0;

    for (const w of warranties) {
      const days = getRemainingDays(w.expiry_date);
      const formattedDate = formatDateDisplay(w.expiry_date);

      // Define standard reminder windows
      const checks: { type: string; condition: boolean; message: string }[] = [
        {
          type: '30_days',
          condition: days <= 30 && days > 7,
          message: `Advance Notice: Warranty for "${w.product_name}" will expire in ${days} days on ${formattedDate}.`,
        },
        {
          type: '7_days',
          condition: days <= 7 && days > 1,
          message: `Urgent Reminder: Warranty for "${w.product_name}" expires in ${days} days (${formattedDate}).`,
        },
        {
          type: '1_day',
          condition: days === 1,
          message: `Critical: Warranty for "${w.product_name}" expires tomorrow on ${formattedDate}.`,
        },
        {
          type: 'today',
          condition: days === 0,
          message: `Action Required: Warranty for "${w.product_name}" expires today (${formattedDate}).`,
        },
      ];

      for (const check of checks) {
        if (check.condition) {
          const deduplicationKey = buildDeduplicationKey(userId, w.id, check.type);
          const created = await db.createNotificationIfNotExists(
            userId,
            w.id,
            check.type,
            check.message,
            deduplicationKey
          );
          if (created) {
            newlyCreated++;
          }
        }
      }
    }

    const { items, unreadCount } = await db.getNotifications(userId);
    return res.json({
      success: true,
      new_notifications_count: newlyCreated,
      total_unread: unreadCount,
      notifications: items,
      message: newlyCreated > 0 
        ? `Generated ${newlyCreated} new warranty expiration alert${newlyCreated > 1 ? 's' : ''}.`
        : 'All expiration reminders are currently up to date.',
    });
  } catch (err: any) {
    console.error('[Notifications] generate-due error:', err);
    return res.status(500).json({ error: 'Failed to generate due notifications.' });
  }
});
