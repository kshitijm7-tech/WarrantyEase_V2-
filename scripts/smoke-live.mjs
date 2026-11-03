/**
 * Live smoke test: exercises the deployed app end to end.
 *
 *   BASE_URL=https://warrantyease.antideploy.app CRON_SECRET=... node scripts/smoke-live.mjs
 *
 * Covers: health, sign-up, warranty CRUD, ownership isolation, invoice upload to
 * private storage, signed download URL, OCR on a real PDF, reminder generation and
 * deduplication, unauthenticated rejection, and the cron endpoint's shared secret.
 * Test accounts use the smoke+<timestamp>@warrantyease.test address.
 */
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const stamp = Date.now();
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function call(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

/* ---------- a structurally valid invoice PDF, built on the fly ---------- */
function escapePdfText(v) {
  return v.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildInvoicePdf(lines) {
  const content = [
    'BT',
    '/F1 20 Tf',
    '72 720 Td',
    '28 TL',
    ...lines.map((l, i) => (i === 0 ? `(${escapePdfText(l)}) Tj` : `* (${escapePdfText(l)}) Tj`.replace('*', 'T*'))),
    'ET',
  ].join('\n');
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  bodies.forEach((b, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const invoicePdf = buildInvoicePdf([
  'Croma Electronics',
  'Sold By: Croma Electronics',
  'Invoice No: INV-SMOKE-0001',
  'Invoice Date: 10/11/2025',
  'Product: Sony WH-1000XM5 Headphones',
  'Warranty: 12 months',
  'Total: INR 29990.00',
]);

/* ------------------------------- the checks ------------------------------- */
const health = await call('/api/v1/health');
check('health endpoint answers', health.status === 200 && health.json.status === 'healthy', health.json.database);
check('database is PostgreSQL', /postgres/i.test(health.json.database || ''), health.json.database);
check('storage is private S3', /s3/i.test(health.json.storage || ''), health.json.storage);

const emailA = `smoke+${stamp}a@warrantyease.test`;
const emailB = `smoke+${stamp}b@warrantyease.test`;
const password = 'smoke-test-password';

const regA = await call('/api/v1/auth/register', {
  method: 'POST',
  body: { name: 'Smoke A', email: emailA, password },
});
check('sign-up returns a session', regA.status === 201 && Boolean(regA.json.token), `status ${regA.status}`);
const tokenA = regA.json.token;

const me = await call('/api/v1/auth/me', { token: tokenA });
check('session identifies the user', me.status === 200 && me.json.user?.email === emailA);

const unauth = await call('/api/v1/warranties');
check('private endpoint rejects anonymous callers', unauth.status === 401, `status ${unauth.status}`);

// Expiry lands inside the 7-day reminder window (today + 7 days at 12 months term).
const now = new Date();
const purchase = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate() + 7));
const purchaseDate = purchase.toISOString().slice(0, 10);

const created = await call('/api/v1/warranties', {
  method: 'POST',
  token: tokenA,
  body: {
    product_name: 'Sony WH-1000XM5 Headphones',
    brand: 'Sony',
    category: 'Audio',
    model_number: 'WH-1000XM5',
    purchase_date: purchaseDate,
    purchase_price: 29990,
    currency: 'INR',
    warranty_duration_months: 12,
    seller: 'Croma Electronics',
  },
});
check('warranty creation', created.status === 201, `status ${created.status} ${created.json.error || ''}`);
const warranty = created.json.warranty;
if (!warranty) {
  console.log('\nAborting: warranty creation failed, so dependent checks cannot run.');
  process.exitCode = 1;
}
const warrantyId = warranty?.id ?? 'missing';

const expectedExpiry = (() => {
  const [y, m, d] = purchaseDate.split('-').map(Number);
  const total = y * 12 + (m - 1) + 12;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const maxDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, maxDay)).padStart(2, '0')}`;
})();
check('expiry calculated from purchase date', warranty?.expiry_date === expectedExpiry, `${warranty?.expiry_date} vs ${expectedExpiry}`);

const listed = await call('/api/v1/warranties?search=Sony', { token: tokenA });
check('search returns the warranty', listed.status === 200 && listed.json.warranties?.length === 1);

const dashboard = await call('/api/v1/dashboard/summary', { token: tokenA });
check('dashboard reflects real rows', dashboard.status === 200 && dashboard.json.summary?.total_warranties === 1, `total=${dashboard.json.summary?.total_warranties}`);
check('7-day warranty is in expiring soon', dashboard.json.summary?.expiring_soon === 1);

/* ------------------------------ file upload ------------------------------ */
const form = new FormData();
form.append('file', new Blob([invoicePdf], { type: 'application/pdf' }), 'smoke-invoice.pdf');
const uploaded = await call('/api/v1/documents/upload', { method: 'POST', token: tokenA, form });
check('invoice upload accepted', uploaded.status === 201, `status ${uploaded.status} ${uploaded.json.error || ''}`);
const documentId = uploaded.json.document?.id;

const signed = await call(`/api/v1/documents/${documentId}/download-url`, { method: 'POST', token: tokenA });
check('signed download URL issued', signed.status === 200 && signed.json.is_signed_s3 === true, `status ${signed.status}`);
if (signed.json.url) {
  const head = await fetch(signed.json.url, { method: 'GET' });
  check('signed URL actually serves the file', head.ok, `status ${head.status}`);
  check('object storage URL is not public', !/\/public\//.test(signed.json.url));
}

/* ---------------------------------- OCR ---------------------------------- */
const ocrForm = new FormData();
ocrForm.append('invoice', new Blob([invoicePdf], { type: 'application/pdf' }), 'smoke-invoice.pdf');
ocrForm.append('save', 'false');
const ocr = await call('/api/v1/ocr/process', { method: 'POST', token: tokenA, form: ocrForm });
check('OCR processes a real PDF', ocr.status === 200 && ocr.json.success === true, ocr.json.error || '');
check('OCR suggests the total', ocr.json.suggestions?.purchase_price === 29990, String(ocr.json.suggestions?.purchase_price));
check('OCR suggests the printed duration', ocr.json.suggestions?.warranty_duration_months === 12);

/* -------------------------- ownership isolation -------------------------- */
const regB = await call('/api/v1/auth/register', {
  method: 'POST',
  body: { name: 'Smoke B', email: emailB, password },
});
const tokenB = regB.json.token;
check('second account signs up', regB.status === 201 && Boolean(tokenB));

const crossRead = await call(`/api/v1/warranties/${warrantyId}`, { token: tokenB });
check("other user cannot read A's warranty", crossRead.status === 404, `status ${crossRead.status}`);

const crossDelete = await call(`/api/v1/warranties/${warrantyId}`, { method: 'DELETE', token: tokenB });
check("other user cannot delete A's warranty", crossDelete.status === 404, `status ${crossDelete.status}`);

const crossDoc = await call(`/api/v1/documents/${documentId}/download-url`, { method: 'POST', token: tokenB });
check("other user cannot download A's invoice", crossDoc.status === 404, `status ${crossDoc.status}`);

const listB = await call('/api/v1/warranties', { token: tokenB });
check("B's list is empty", listB.status === 200 && listB.json.warranties?.length === 0);

/* ---------------------------- notifications ---------------------------- */
const gen1 = await call('/api/v1/notifications/generate-due', { method: 'POST', token: tokenA });
check('reminder generated for the 7-day window', gen1.status === 200 && gen1.json.new_notifications_count >= 1, `created=${gen1.json.new_notifications_count}`);
const gen2 = await call('/api/v1/notifications/generate-due', { method: 'POST', token: tokenA });
check('reminders are deduplicated', gen2.status === 200 && gen2.json.new_notifications_count === 0, `created=${gen2.json.new_notifications_count}`);

/* ------------------------------- cron --------------------------------- */
const cron = await call('/api/v1/cron/reminders', { method: 'POST' });
if (!process.env.CRON_SECRET) {
  check('cron rejects callers without the secret', cron.status === 401 || cron.status === 503, `status ${cron.status}`);
} else {
  check('cron rejects callers without the secret', cron.status === 401, `status ${cron.status}`);
  const cronOk = await fetch(`${BASE}/api/v1/cron/reminders`, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET },
  });
  const cronJson = await cronOk.json().catch(() => ({}));
  check('cron runs with the secret', cronOk.status === 200 && cronJson.success === true, JSON.stringify(cronJson).slice(0, 160));
}

/* ------------------------------- cleanup ------------------------------- */
await call(`/api/v1/warranties/${warrantyId}`, { method: 'DELETE', token: tokenA });
if (documentId) await call(`/api/v1/documents/${documentId}`, { method: 'DELETE', token: tokenA });
const afterCleanup = await call('/api/v1/warranties', { token: tokenA });
check('warranty deleted', afterCleanup.json.warranties?.length === 0);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log('Failed:', failed.map((f) => f.name).join(' | '));
  process.exitCode = 1;
}
