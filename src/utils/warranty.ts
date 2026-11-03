/**
 * Pure business logic and calculation rules for WarrantyEase
 */

/**
 * Calculates the exact warranty expiry date given a purchase date string (YYYY-MM-DD)
 * and duration in months.
 * Follows standard commercial warranty calculation:
 * The date shifts forward by the specified number of months.
 * If the resulting month has fewer days than the start day (e.g. Jan 31 + 1 month),
 * it clamps to the last valid day of that month (Feb 28 or Feb 29 in a leap year).
 */
export function calculateExpiryDate(purchaseDateStr: string, durationMonths: number): string {
  if (!purchaseDateStr) return '';
  const parts = purchaseDateStr.split('-');
  if (parts.length !== 3) return '';
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10); // 1-indexed (1 to 12)
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) || durationMonths <= 0) {
    return purchaseDateStr;
  }

  // Calculate target year and month (1-indexed)
  const totalMonths = (year * 12 + (month - 1)) + durationMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1; // 1-12

  // Determine max days in target month
  const maxDays = getDaysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(day, maxDays);

  const yStr = targetYear.toString().padStart(4, '0');
  const mStr = targetMonth.toString().padStart(2, '0');
  const dStr = targetDay.toString().padStart(2, '0');

  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Returns number of days in a given year and month (1-12)
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Calculates remaining days from a reference date (defaults to today in UTC)
 * Negative value indicates expired.
 */
export function getRemainingDays(expiryDateStr: string, referenceDateStr?: string): number {
  if (!expiryDateStr) return 0;
  
  const targetParts = expiryDateStr.split('-').map(Number);
  if (targetParts.length !== 3) return 0;
  
  const targetUtc = Date.UTC(targetParts[0], targetParts[1] - 1, targetParts[2]);

  let refUtc: number;
  if (referenceDateStr) {
    const refParts = referenceDateStr.split('-').map(Number);
    refUtc = Date.UTC(refParts[0], refParts[1] - 1, refParts[2]);
  } else {
    const now = new Date();
    refUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((targetUtc - refUtc) / msPerDay);
}

export type WarrantyStatus = 'active' | 'expiring_soon' | 'expiring_today' | 'expired';

/**
 * Evaluates warranty status based on expiry date
 */
export function getWarrantyStatus(expiryDateStr: string, referenceDateStr?: string): WarrantyStatus {
  const days = getRemainingDays(expiryDateStr, referenceDateStr);
  if (days < 0) {
    return 'expired';
  }
  if (days === 0) {
    return 'expiring_today';
  }
  if (days <= 30) {
    return 'expiring_soon';
  }
  return 'active';
}

/**
 * Determines reminder alert trigger window for automated notifications
 */
export function getReminderTrigger(daysRemaining: number): '30_days' | '7_days' | '1_day' | 'today' | null {
  if (daysRemaining === 30) return '30_days';
  if (daysRemaining === 7) return '7_days';
  if (daysRemaining === 1) return '1_day';
  if (daysRemaining === 0) return 'today';
  return null;
}

/**
 * Builds deterministic notification deduplication key
 */
export function buildDeduplicationKey(userId: string, warrantyId: string, reminderType: string): string {
  return `${userId}:${warrantyId}:${reminderType}`;
}

/**
 * Formats currency values cleanly
 */
export function formatCurrency(amount: number | null | undefined, currency: string = 'INR'): string {
  if (amount == null || isNaN(amount)) return '—';
  
  const symbols: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
  };

  const symbol = symbols[currency] || `${currency} `;
  return `${symbol}${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * Formats YYYY-MM-DD into readable date (e.g. "12 Oct 2025")
 */
export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
