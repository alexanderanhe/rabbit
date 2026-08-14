# Rabbit Timer

Installable pixel-art timer with local persistence, screen wake lock, local notifications, and optional scheduled Web Push.

## Local app

```bash
pnpm install
pnpm dev
```

The timer remains fully functional without MongoDB or Redis. In that mode, timers are stored in the browser and notifications are best-effort while the PWA can still execute.

## Reliable background notifications

The notification backend uses MongoDB for anonymous timers and subscriptions, and Redis with BullMQ for delayed jobs.

```bash
cp .env.example .env
pnpm vapid:generate
```

Copy the generated keys into `.env`. `VAPID_SUBJECT` must be a `mailto:` address or an HTTPS URL you control. Start MongoDB and Redis, then run the web process and worker separately:

```bash
pnpm dev
pnpm worker
```

For production, `.env.production` is loaded by both the web process and worker:

```bash
pnpm worker:prod
```

The deployment build synchronizes the PM2 worker after compiling the app:

```bash
pnpm deploy:build
```

This recreates only the `rabbit-worker` process with the project directory as
its explicit working directory. You can override the base name manually:

```bash
pnpm services:sync:prod -- --name rabbit-staging
```

BullMQ retains delayed jobs in Redis during restarts and processes overdue jobs when the worker reconnects.

## Data and security

- Each anonymous timer has a separate 32-character token.
- Only its SHA-256 hash is stored in MongoDB.
- Push subscriptions remain server-side.
- MongoDB removes timer documents seven days after their finish using a TTL index.
- Pausing removes the job; resuming schedules it at the updated `endsAt`.
- Expired Push subscriptions (`404`/`410`) are retired without retrying.

## Accounts and sync

Accounts are optional. Registration verifies the email with a six-digit code before asking for a password; every sign-in also requires a new email code. Delivery uses Resend, so configure `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`. Passwords use salted `scrypt` hashes, codes are stored only as hashes, and MongoDB-backed sessions last up to 400 days. Set a strong `SESSION_SECRET` in production. Signed-in timers and existing anonymous timers are linked to the account automatically using their local secret tokens. MongoDB provides active timer and history synchronization across devices.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

The public liveness/readiness endpoint is `GET /_health`. MongoDB is required and produces HTTP 503 when unavailable. Redis is reported as degraded while retaining HTTP 200 because the web application can continue serving timers without background Push delivery. The endpoint performs read-only pings with a short timeout and never exposes connection errors.
