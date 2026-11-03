import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderWindow, reminderMessage } from './reminders.js';

test('reminderWindow maps day counts into the 30/7/1/0 day windows', () => {
  assert.equal(reminderWindow(45), null);
  assert.equal(reminderWindow(31), null);
  assert.equal(reminderWindow(30), '30_days');
  // A late cron run must still produce the notice rather than dropping it.
  assert.equal(reminderWindow(26), '30_days');
  assert.equal(reminderWindow(8), '30_days');
  assert.equal(reminderWindow(7), '7_days');
  assert.equal(reminderWindow(2), '7_days');
  assert.equal(reminderWindow(1), '1_day');
  assert.equal(reminderWindow(0), 'today');
});

test('reminderWindow never reminds for an already expired warranty', () => {
  assert.equal(reminderWindow(-1), null);
  assert.equal(reminderWindow(-400), null);
});

test('reminderMessage names the product and formats the expiry date', () => {
  const message = reminderMessage('7_days', 'Sony WH-1000XM5', '2026-11-17', 7);
  assert.match(message, /Sony WH-1000XM5/);
  assert.match(message, /17 Nov 2026/);
  assert.match(message, /7 days/);
});
