import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExpiryDate,
  getDaysInMonth,
  getRemainingDays,
  getWarrantyStatus,
  getReminderTrigger,
  buildDeduplicationKey,
  formatCurrency,
  formatDateDisplay,
} from './warranty';

test('calculateExpiryDate standard 12 months duration', () => {
  const result = calculateExpiryDate('2024-05-15', 12);
  assert.equal(result, '2025-05-15');
});

test('calculateExpiryDate month-end rollover in non-leap year (Jan 31 to Feb 28)', () => {
  const result = calculateExpiryDate('2025-01-31', 1);
  assert.equal(result, '2025-02-28');
});

test('calculateExpiryDate month-end rollover in leap year (Jan 31 2024 to Feb 29 2024)', () => {
  const result = calculateExpiryDate('2024-01-31', 1);
  assert.equal(result, '2024-02-29');
});

test('calculateExpiryDate 24 months spanning leap year', () => {
  const result = calculateExpiryDate('2023-02-28', 24);
  assert.equal(result, '2025-02-28');
});

test('getDaysInMonth verifies leap vs non-leap years', () => {
  assert.equal(getDaysInMonth(2024, 2), 29);
  assert.equal(getDaysInMonth(2025, 2), 28);
  assert.equal(getDaysInMonth(2024, 4), 30);
  assert.equal(getDaysInMonth(2024, 7), 31);
});

test('getRemainingDays calculates positive, zero, and negative days accurately', () => {
  assert.equal(getRemainingDays('2025-05-20', '2025-05-10'), 10);
  assert.equal(getRemainingDays('2025-05-10', '2025-05-10'), 0);
  assert.equal(getRemainingDays('2025-05-01', '2025-05-10'), -9);
});

test('getWarrantyStatus returns correct status thresholds', () => {
  // > 30 days = active
  assert.equal(getWarrantyStatus('2025-06-20', '2025-05-10'), 'active');
  // 30 days = expiring_soon
  assert.equal(getWarrantyStatus('2025-06-09', '2025-05-10'), 'expiring_soon');
  // 5 days = expiring_soon
  assert.equal(getWarrantyStatus('2025-05-15', '2025-05-10'), 'expiring_soon');
  // 0 days = expiring_today
  assert.equal(getWarrantyStatus('2025-05-10', '2025-05-10'), 'expiring_today');
  // past = expired
  assert.equal(getWarrantyStatus('2025-05-09', '2025-05-10'), 'expired');
});

test('getReminderTrigger detects standard 30d, 7d, 1d, and 0d intervals', () => {
  assert.equal(getReminderTrigger(30), '30_days');
  assert.equal(getReminderTrigger(7), '7_days');
  assert.equal(getReminderTrigger(1), '1_day');
  assert.equal(getReminderTrigger(0), 'today');
  assert.equal(getReminderTrigger(15), null);
  assert.equal(getReminderTrigger(-2), null);
});

test('buildDeduplicationKey creates unique deterministic key', () => {
  const key = buildDeduplicationKey('usr_123', 'war_456', '7_days');
  assert.equal(key, 'usr_123:war_456:7_days');
});

test('formatCurrency formats INR with symbol', () => {
  assert.equal(formatCurrency(49999, 'INR'), '₹49,999');
  assert.equal(formatCurrency(1200, 'USD'), '$1,200');
  assert.equal(formatCurrency(null), '—');
});

test('formatDateDisplay produces readable date', () => {
  assert.equal(formatDateDisplay('2025-10-15'), '15 Oct 2025');
  assert.equal(formatDateDisplay(''), '—');
});
