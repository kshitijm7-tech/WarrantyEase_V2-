import { Response, NextFunction } from 'express';
import { db } from './db.js';
import { AuthenticatedRequest } from './auth.js';
import { getRemainingDays, formatDateDisplay, buildDeduplicationKey } from '../src/utils/warranty.js';

/**
 * Which reminder window a warranty falls into today.
 * Windows (not exact days) so a missed cron run never silently loses a reminder:
 * a warranty first seen at 26 days still gets its 30-day notice.
 */
export type ReminderType = '30_days' | '7_days' | '1_day' | 'today';

export function reminderWindow(daysRemaining: number): ReminderType | null {
  if (daysRemaining < 0) return null;
  if (daysRemaining === 0) return 'today';
  if (daysRemaining === 1) return '1_day';
  if (daysRemaining <= 7) return '7_days';
  if (daysRemaining <= 30) return '30_days';
  return null;
}

export function reminderMessage(
  type: ReminderType,
  productName: string,
  expiryDate: string,
  daysRemaining: number
): string {
  const on = formatDateDisplay(expiryDate);
  switch (type) {
    case 'today':
      return `Action required: the warranty for "${productName}" expires today (${on}).`;
    case '1_day':
      return `Critical: the warranty for "${productName}" expires tomorrow (${on}).`;
    case '7_days':
      return `Urgent: the warranty for "${productName}" expires in ${daysRemaining} days (${on}).`;
    case '30_days':
    default:
      return `Heads up: the warranty for "${productName}" expires in ${daysRemaining} days (${on}).`;
  }
}

/** Creates any due reminders for one user. Returns how many rows were created. */
export async function generateDueNotificationsForUser(userId: string): Promise<number> {
  const warranties = await db.getWarranties(userId);
  let created = 0;

  for (const warranty of warranties) {
    const days = getRemainingDays(warranty.expiry_date);
    const type = reminderWindow(days);
    if (!type) continue;

    const key = buildDeduplicationKey(userId, warranty.id, type);
    const message = reminderMessage(type, warranty.product_name, warranty.expiry_date, days);
    if (await db.createNotificationIfNotExists(userId, warranty.id, type, message, key)) {
      created += 1;
    }
  }

  return created;
}

export interface ReminderRunResult {
  users_scanned: number;
  warranties_scanned: number;
  notifications_created: number;
}

/** Cron entry point: due reminders for every account. */
export async function generateDueNotificationsForAllUsers(): Promise<ReminderRunResult> {
  const userIds = await db.getAllUserIds();
  let warrantiesScanned = 0;
  let created = 0;

  for (const userId of userIds) {
    const warranties = await db.getWarranties(userId);
    warrantiesScanned += warranties.length;
    for (const warranty of warranties) {
      const days = getRemainingDays(warranty.expiry_date);
      const type = reminderWindow(days);
      if (!type) continue;
      const key = buildDeduplicationKey(userId, warranty.id, type);
      const message = reminderMessage(type, warranty.product_name, warranty.expiry_date, days);
      if (await db.createNotificationIfNotExists(userId, warranty.id, type, message, key)) {
        created += 1;
      }
    }
  }

  return {
    users_scanned: userIds.length,
    warranties_scanned: warrantiesScanned,
    notifications_created: created,
  };
}

/**
 * Optional shared-secret guard for the cron endpoint. The platform cron job can
 * send `x-cron-secret`; without CRON_SECRET configured the endpoint stays closed
 * rather than silently open.
 */
export function requireCronSecret(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({
      error: 'Scheduled reminders are disabled: CRON_SECRET is not configured on this server.',
    });
  }
  // The platform cron job can set neither a header nor a bearer token, so a
  // secret in the query string is accepted as well as the header form.
  const provided =
    (req.headers['x-cron-secret'] as string | undefined) ||
    (typeof req.query.secret === 'string' ? req.query.secret : undefined) ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined);
  if (provided !== secret) {
    return res.status(401).json({ error: 'Invalid cron secret.' });
  }
  return next();
}
