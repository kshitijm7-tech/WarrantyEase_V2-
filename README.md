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
| Auth | Clerk (server-verified session tokens); local email sessions only as a gated dev fallback |
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
