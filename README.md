# WarrantyEase

Digital warranty and invoice manager: register purchases, store invoices in private object
storage, calculate expiry dates, and get 30 / 7 / 1 / 0-day reminders.

One server serves both the API and the built frontend, so production is a single
AntiDeploy application.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| API | Node.js + Express (`server.ts`) |
| Auth | Clerk when the deployment holds a matching **live** instance; otherwise server-verified email + password sessions (see [Sign-in](#sign-in-fallback-vs-clerk-production-instance)) |
| Data | PostgreSQL (AntiDeploy-managed `DATABASE_URL`), parameterised SQL, versioned migrations |
| Files | Private S3-compatible bucket (`AWS_*`, `BUCKET_NAME`), path-style, 15-minute signed URLs |
| OCR | Tesseract.js for images and rendered PDF pages; pdfjs + `@napi-rs/canvas` for page rendering |

## Layout

```
server.ts                 Express app: API mount, static SPA, cron endpoint
server/auth.ts            Clerk verification + gated local sessions
server/db.ts              PostgreSQL data access (SQLite fallback for local tests only)
server/migrate.ts         Versioned migration runner
server/migrations/        *.sql migrations applied in filename order
server/storage.ts         Private bucket upload, signed URLs, existence checks
server/ocr.ts             Field extraction + Tesseract orchestration
server/pdf.ts             PDF text layer + page rasterization (bounded)
server/reminders.ts       Reminder windows, dedup keys, all-user cron run
server/routes/            auth, warranties, documents, notifications, dashboard, ocr
src/                      React SPA (pages, components, API client, pure date logic)
```

## Environment

The platform injects the database, storage and signing secrets. Locally they are written into
`.env` (git-ignored) from the AntiDeploy console.

| Variable | Source | Purpose |
| --- | --- | --- |
| `DATABASE_URL`, `PG*` | platform | PostgreSQL connection |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `BUCKET_NAME` | platform | private invoice bucket |
| `JWT_SECRET`, `APP_URL` | platform (generated) | local session signing, absolute URLs |
| `CLERK_SECRET_KEY` | you (server secret) | verifies Clerk session tokens |
| `VITE_CLERK_PUBLISHABLE_KEY` | you (public) | browser Clerk SDK |
| `CRON_SECRET` | generated | guards `POST|GET /api/v1/cron/reminders` |
| `DEMO_MODE` | optional | `true` enables `/api/v1/auth/demo`; off by default in production |
| `ALLOW_LOCAL_AUTH` | optional | overrides the local-email-session fallback |

No secret is ever sent to the browser. `GET /api/v1/health` reports only the database,
storage and auth *modes*, never credentials.

## Sign-in: fallback vs Clerk production instance

`GET /api/v1/auth/config` is the single source of truth, and the UI renders only the method
it reports, so it can never show a sign-in form that the server would reject.

| Config | What the deployment does |
| --- | --- |
| `clerk_enabled: true`, `local_auth: false` | Clerk only. Every request carries a fresh Clerk session token, verified server-side with `@clerk/backend`; ownership is keyed on the verified `sub`. |
| `clerk_enabled: true`, `local_auth: true` | Both. The Clerk widget is rendered first, with the email + password form below it — used when the deployment holds a development instance. |
| `clerk_enabled: false`, `local_auth: true` | Email + password only: bcrypt hashes, an httpOnly session cookie, and the same ownership rules. |

### Why a Clerk development instance falls back

A Clerk **development** instance (`pk_test_` / `sk_test_`, frontend API `*.clerk.accounts.dev`)
only authenticates the developer's own browser. It requires a Clerk-dashboard "dev browser"
cookie, and any other visitor gets `dev_browser_unauthenticated` and is sent to the Clerk
dashboard — which is why a deployed app on a `pk_test_` key appears to be stuck right after
signing in.

Clerk is only mounted when a secret key is configured and it agrees with the publishable key's
environment. Whether Clerk *alone* can serve the public is separate: on a production server
that is only true for a `sk_live_` instance. With the development instance this project
currently holds, `/api/v1/auth/config` reports `clerk_enabled: true, clerk_public: false,
clerk_environment: "development"`, so the deployed app shows the Clerk widget for the owner
and the working email/password form for everyone else. `ALLOW_LOCAL_AUTH=true|false` forces
either behaviour.

### Switching to the real Clerk instance

No code change and no redeploy of the frontend build is needed — the publishable key is served
by the API, so only the environment changes.

1. Clerk dashboard → the WarrantyEase application (`app_3LbyOokVldXL1AeXN9gAUCMMSTN`) →
   **Production** → create the production instance.
2. Add the deployment domain (`warrantyease.antideploy.app`) and create the CNAME record Clerk
   shows. Wait until Clerk reports the domain as verified.
3. Copy the production keys: `pk_live_…` (publishable) and `sk_live_…` (secret).
4. Set both in AntiDeploy → Environment/Secrets:
   `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…` and `CLERK_SECRET_KEY=sk_live_…`.
   Keep `ALLOW_LOCAL_AUTH` unset so the server decides.
5. Redeploy. On boot, `requireAuth` starts accepting Clerk tokens and the config flips to
   `clerk_enabled: true`, `local_auth: false` automatically.
6. Verify:

   ```bash
   curl -s https://warrantyease.antideploy.app/api/v1/auth/config
   # {"clerk_enabled":true,"clerk_environment":"production","local_auth":false,...}

   BASE_URL=https://warrantyease.antideploy.app CLERK_SECRET_KEY=sk_live_... \
     node scripts/smoke-live.mjs
   ```

`scripts/smoke-live.mjs` reads that config and switches to the Clerk path by itself; it mints
real Clerk session tokens through a Backend API sign-in ticket, so it needs `CLERK_SECRET_KEY`
and at least one existing Clerk user (override with `CLERK_SMOKE_USER_IDS=user_a,user_b`).
Against a development instance the token exchange is refused by Clerk, and the script reports
`SKIP` instead of a pass.

### Smoke-test cleanup

Each run removes what it created, including its throwaway accounts, through
`DELETE /api/v1/auth/account` (deletes the caller's account, its invoices and every owned row).
Rows left by older runs can be removed with:

```bash
node --env-file=.env scripts/cleanup-smoke-users.mjs                       # dry run
node --env-file=.env scripts/cleanup-smoke-users.mjs --apply               # delete
node --env-file=.env scripts/cleanup-smoke-users.mjs --apply --pattern='livesmoke%@example.com'
```

## Local development

```bash
npm install
npm run dev          # Express + Vite middleware on http://localhost:4000
npm test             # unit + PDF/OCR tests
npm run lint         # tsc --noEmit
npm run migrate      # apply pending SQL migrations
```

## Production build

```bash
npm run build        # vite build  -> dist/        (frontend)
                     # esbuild      -> dist-server/ (server bundle + migrations)
npm start            # node scripts/start.mjs -> dist-server/server.js
```

`npm start` sets `NODE_ENV=production` before loading the bundle, so the server serves
`dist/` instead of attaching Vite. It listens on `0.0.0.0:$PORT` (port 3000 when unset).

Migrations run at boot inside `db.init()` and are recorded in `schema_migrations`; running the
same deploy twice is a no-op. A migration never replaces a legacy table that still holds rows.

## Deploying to AntiDeploy

1. `POST /api/v1/applications` (or reuse the existing application) and keep its id in `.antideploy.json`.
2. Provision the database and bucket with `POST /api/v1/database` and `POST /api/v1/storage`, then
   write their env files into `.env` for local work. The platform sets the same variables in the
   running container, so they are never pushed as secrets.
3. Push Clerk keys through `PUT /api/v1/secrets` (or the secrets request link). The platform does
   not provide Clerk.
4. `POST /api/v1/deploy?applicationId=<id>` with the project directory.
5. `GET /api/v1/health?applicationId=<id>` and `GET /api/v1/logs?applicationId=<id>` to confirm it serves.
6. Reminders are automated only once a cron job exists:
   `POST /api/v1/cron?applicationId=<id>` with the path `/api/v1/cron/reminders` and a schedule.
   Until then, use the in-app "Check Expiries" action.

## Behaviour notes

- Expiry dates are computed from the purchase date plus the duration in months, clamped to the
  last valid day of the target month (Jan 31 + 1 month = Feb 28/29). The current date is read at
  request time; nothing is hardcoded.
- OCR fields are suggestions. An unknown warranty duration stays empty and the UI requires the
  user to confirm purchase date and duration before the expiry date is calculated.
- OCR is bounded: 10 MB per file, 3 PDF pages, `withTimeout` around text extraction, page
  rendering and Tesseract. A failure returns an explicit error and never a fake success.
- Reminder deduplication uses a unique `(user_id, warranty_id, reminder_type)` key with
  `INSERT ... ON CONFLICT DO NOTHING`, so repeated cron runs cannot duplicate alerts.
