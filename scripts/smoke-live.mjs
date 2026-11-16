/**
 * Live smoke test: exercises the deployed app end to end.
 *
 *   BASE_URL=https://warrantyease.antideploy.app CRON_SECRET=... node scripts/smoke-live.mjs
 *
 * The script starts by reading `GET /api/v1/auth/config` and then uses the
 * sign-in method the deployment actually offers:
 *
 *   - email/password / local_auth:   registers two throwaway accounts
 *                                    (smoke+<timestamp>{a,b}@warrantyease.test).
 *   - Clerk / clerk_enabled:         mints real session tokens for existing
 *                                    Clerk users, so it needs CLERK_SECRET_KEY.
 *                                    Optional: CLERK_SMOKE_USER_IDS="user_a,user_b".
 *                                    A Clerk *development* instance cannot mint a
 *                                    token outside the developer's browser; that
 *                                    is reported as a SKIP, not a pass.
 *
 * Covers: health, session, warranty CRUD, ownership isolation, invoice upload to
 * private storage, signed download URL, OCR on a real PDF, reminder generation and
 * deduplication, unauthenticated rejection, and the cron endpoint's shared secret.
 * Anything it creates is deleted again, including the throwaway accounts, so a
 * repeated run leaves no rows behind.
 */
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const stamp = Date.now();
const results = [];
const skipped = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Not run on this deployment. Reported separately so it never looks like a pass. */
function skip(name, reason) {
  skipped.push({ name, reason });
  console.log(`SKIP  ${name}  — ${reason}`);
}

async function call(path, { method = 'GET', token, body, form, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
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

/* --------------------------- sign-in strategies --------------------------- */

/** Registers a throwaway email/password account and returns its session. */
async function localSession(label) {
  const email = `smoke+${stamp}${label}@warrantyease.test`;
  const password = 'smoke-test-password';
  const res = await call('/api/v1/auth/register', {
    method: 'POST',
    body: { name: `Smoke ${label.toUpperCase()}`, email, password },
  });
  return {
    ok: res.status === 201 && Boolean(res.json.token),
    detail: `status ${res.status}${res.json.error ? ` ${res.json.error}` : ''}`,
    token: res.json.token,
    userId: res.json.user?.id,
    email,
    password,
  };
}

/**
 * Mints a Clerk session JWT without a browser: Backend API sign-in ticket ->
 * Frontend API sign-in -> session token. Returns an explanatory error instead of
 * throwing, because a development instance refuses this by design.
 */
async function clerkSession(userId, publishableKey, secretKey) {
  const fapi = `https://${Buffer.from(publishableKey.split('_').slice(2).join('_'), 'base64')
    .toString('utf8')
    .replace(/\$$/, '')}`;

  const ticketRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 600 }),
  });
  const ticket = await ticketRes.json().catch(() => ({}));
  if (!ticket.token) {
    return { ok: false, detail: `sign-in token ${ticketRes.status} ${JSON.stringify(ticket).slice(0, 120)}` };
  }

  const jar = new Map();
  const keepCookies = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };

  const signIn = await fetch(`${fapi}/v1/client/sign_ins?_clerk_js_version=5`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ strategy: 'ticket', ticket: ticket.token }).toString(),
  });
  keepCookies(signIn);
  const signInBody = await signIn.json().catch(() => ({}));
  const sessionId = signInBody?.response?.created_session_id || signInBody?.client?.sessions?.[0]?.id;
  if (!sessionId) {
    const code = signInBody?.errors?.[0]?.code || `status ${signIn.status}`;
    return { ok: false, detail: `sign-in failed: ${code}` };
  }

  const tokenRes = await fetch(`${fapi}/v1/client/sessions/${sessionId}/tokens?_clerk_js_version=5`, {
    method: 'POST',
    headers: { Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  keepCookies(tokenRes);
  const tokenBody = await tokenRes.json().catch(() => ({}));
  if (!tokenBody.jwt) {
    const code = tokenBody?.errors?.[0]?.code || `status ${tokenRes.status}`;
    return { ok: false, detail: `session token refused: ${code}` };
  }

  const userRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const user = await userRes.json().catch(() => ({}));
  return {
    ok: true,
    detail: 'minted via sign-in ticket',
    token: tokenBody.jwt,
    userId,
    email: user?.email_addresses?.[0]?.email_address || '',
  };
}

/** Picks up to two existing Clerk users that have an email address. */
async function pickClerkUsers(secretKey) {
  const configured = (process.env.CLERK_SMOKE_USER_IDS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (configured.length) return configured;

  const res = await fetch('https://api.clerk.com/v1/users?limit=20', {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const users = await res.json().catch(() => []);
  if (!Array.isArray(users)) return [];
  return users
    .filter((u) => u?.id && u.email_addresses?.length)
    .slice(0, 2)
    .map((u) => u.id);
}

/* ------------------------------- the checks ------------------------------- */
const health = await call('/api/v1/health');
check('health endpoint answers', health.status === 200 && health.json.status === 'healthy', health.json.database);
check('database is PostgreSQL', /postgres/i.test(health.json.database || ''), health.json.database);
check('storage is private S3', /s3/i.test(health.json.storage || ''), health.json.storage);

const authConfig = await call('/api/v1/auth/config');
const config = authConfig.json || {};
const mode = config.clerk_enabled ? 'clerk' : config.local_auth ? 'local' : 'none';
check(
  'auth config reports a usable sign-in method',
  authConfig.status === 200 && mode !== 'none',
  `clerk_enabled=${config.clerk_enabled} local_auth=${config.local_auth} clerk_environment=${config.clerk_environment ?? 'n/a'}`
);

if (mode === 'none') {
  console.log('\nAborting: the deployment offers no sign-in method, so every auth check would fail.');
  process.exitCode = 1;
}

let sessionA;
let sessionB;

if (mode === 'local') {
  sessionA = await localSession('a');
  check('sign-up returns a session', sessionA.ok, sessionA.detail);
  sessionB = await localSession('b');
  check('second account signs up', sessionB.ok, sessionB.detail);
} else if (mode === 'clerk') {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = config.clerk_publishable_key || process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    skip('Clerk session checks', 'set CLERK_SECRET_KEY (and a publishable key) to mint Clerk session tokens');
  } else {
    const userIds = await pickClerkUsers(secretKey);
    if (userIds.length === 0) {
      skip('Clerk session checks', 'no Clerk user with an email address exists yet; sign up once in the browser or set CLERK_SMOKE_USER_IDS');
    } else {
      sessionA = await clerkSession(userIds[0], publishableKey, secretKey);
      check('Clerk session token accepted by the API', sessionA.ok, sessionA.detail);

      if (userIds[1]) {
        sessionB = await clerkSession(userIds[1], publishableKey, secretKey);
        check('second Clerk identity signs in', sessionB.ok, sessionB.detail);
      }
    }
  }
}

// Second identity is optional (a deployment can have a single Clerk user), so the
// isolation checks are skipped explicitly rather than silently passing.
const secondIdentity = sessionB?.ok ? sessionB : null;

// Without a session every remaining check fails for the same reason, which would
// read as a broken deployment. Stop here and name the actual blocker instead.
if (!sessionA?.ok) {
  console.log(`\nCannot obtain a session (${mode}): ${sessionA?.detail || 'unknown error'}`);
  if (mode === 'clerk') {
    console.log(
      'A Clerk development instance only authenticates the developer\'s own browser, so it refuses' +
        ' tokens minted outside it (dev_browser_unauthenticated). Use a production instance' +
        ' (README -> Sign-in), or run against a deployment that offers email/password sign-in.'
    );
  }
  console.log('Authenticated checks were not run.');
  process.exit(1);
}

const tokenA = sessionA.token;
const expectedUserId = sessionA?.userId;

if (tokenA) {
  const me = await call('/api/v1/auth/me', { token: tokenA });
  check(
    'session identifies the user',
    me.status === 200 && Boolean(me.json.user?.id) && (!expectedUserId || me.json.user.id === expectedUserId),
    `status ${me.status}`
  );

  const unauth = await call('/api/v1/warranties');
  check('private endpoint rejects anonymous callers', unauth.status === 401, `status ${unauth.status}`);
}

// Expiry lands inside the 7-day reminder window (today + 7 days at 12 months term).
const now = new Date();
const purchase = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate() + 7));
const purchaseDate = purchase.toISOString().slice(0, 10);

const created = tokenA
  ? await call('/api/v1/warranties', {
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
    })
  : { status: 0, json: {} };
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
if (!secondIdentity) {
  skip('ownership isolation checks', 'a second identity was not available (needed to prove cross-user access is denied)');
} else {
  const tokenB = secondIdentity.token;

  const crossRead = await call(`/api/v1/warranties/${warrantyId}`, { token: tokenB });
  check("other user cannot read A's warranty", crossRead.status === 404, `status ${crossRead.status}`);

  const crossDelete = await call(`/api/v1/warranties/${warrantyId}`, { method: 'DELETE', token: tokenB });
  check("other user cannot delete A's warranty", crossDelete.status === 404, `status ${crossDelete.status}`);

  const crossDoc = await call(`/api/v1/documents/${documentId}/download-url`, { method: 'POST', token: tokenB });
  check("other user cannot download A's invoice", crossDoc.status === 404, `status ${crossDoc.status}`);

  const listB = await call('/api/v1/warranties', { token: tokenB });
  check("B's list is empty", listB.status === 200 && listB.json.warranties?.length === 0);
}

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

// The throwaway accounts themselves are deleted too, so repeated runs against a
// production database do not accumulate users. `DELETE /api/v1/auth/account`
// removes the caller's own account, its invoices and every owned row.
if (mode === 'local') {
  const deletedA = await call('/api/v1/auth/account', { method: 'DELETE', token: sessionA.token });
  check('throwaway account deleted', deletedA.status === 200, `status ${deletedA.status}`);

  const afterDelete = await call('/api/v1/auth/me', { token: sessionA.token });
  check('deleted account can no longer authenticate', afterDelete.status === 401, `status ${afterDelete.status}`);

  if (sessionB?.ok) {
    const deletedB = await call('/api/v1/auth/account', { method: 'DELETE', token: sessionB.token });
    check('second throwaway account deleted', deletedB.status === 200, `status ${deletedB.status}`);
  }
} else {
  skip('throwaway account cleanup', 'Clerk accounts are managed in Clerk and were not created by this script');
}

const failed = results.filter((r) => !r.ok);
console.log(`\nsign-in method: ${mode}`);
console.log(`${results.length - failed.length}/${results.length} checks passed${skipped.length ? `, ${skipped.length} skipped` : ''}`);
if (failed.length > 0) {
  console.log('Failed:', failed.map((f) => f.name).join(' | '));
  process.exitCode = 1;
}
