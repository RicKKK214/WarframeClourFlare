# Deploying to Cloudflare Workers + D1

The app now supports **two hosts from one codebase**:

| | Render (default) | Cloudflare Workers |
|---|---|---|
| Database | PostgreSQL (Neon) | **D1** (SQLite) |
| Prisma schema | `prisma/schema.prisma` | `prisma/schema.d1.prisma` |
| Scanning | background timer in-process | **cron trigger** hits `/api/cron/scan` |
| Cold starts | ~50s after idle spin-down | none |
| Keep-alive needed | yes (UptimeRobot) | **no** |

Nothing about the Render setup changed — Postgres remains the default.

---

## Why the architecture differs

Two Cloudflare constraints forced real changes rather than a config tweak:

**1. There is no long-running process.** A Worker isolate is destroyed once it responds, so
the `setTimeout` scan loop would silently never fire. Scanning is therefore *pulled* by a
Cron Trigger (`/api/cron/scan`) rather than *pushed* by the app. `DISABLE_BACKGROUND_SCAN`
is set to `true` in `wrangler.jsonc` so the timer is not even attempted.

**2. Subrequests are capped per invocation** — 50 on the Free plan. Each set costs about
5 fetches (the set plus its parts), so a 20-set batch (~100 fetches) would be killed
mid-scan. `CRON_BATCH_LIMIT` defaults to **8 sets (~40 fetches)**. The scanner rotates
through the catalog, so successive runs cover different sets and the full catalog is
refreshed over time — just more gradually than on Render.

A third constraint shaped the schema: **D1 has no `Json` column type**. Prisma refuses to
validate `payload Json` against SQLite. The D1 schema uses `payload String` and the code
serialises with `encodePayload()` / `decodePayload()`, which reads both a TEXT string (D1)
and an already-parsed object (existing Postgres `jsonb` rows).

---

## Setup

### 1. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create wfarb
```

Copy the returned `database_id` into `wrangler.jsonc`, replacing
`REPLACE_WITH_YOUR_D1_DATABASE_ID`.

### 2. Create the tables

D1 is not reachable over TCP, so `prisma db push` does not work. Generate SQL and apply it:

```bash
npm run cf:d1:sql
npx wrangler d1 execute wfarb --remote --file=prisma/d1-schema.sql
```

### 3. Protect the cron endpoint

```bash
npx wrangler secret put CRON_SECRET
```

Without this, anyone could call `/api/cron/scan` repeatedly and burn both your Worker
quota and Warframe.market's rate limit. With it set, the endpoint returns **401** unless
the request carries `Authorization: Bearer <secret>` or `?key=<secret>`.

### 4. Deploy

```bash
npm run cf:deploy
```

Verified bundle size: **959 KiB gzipped**, against a 3 MiB limit on the Free plan.

---

## Free tier limits

| Resource | Cloudflare Free | This app |
|---|---|---|
| Requests | 100,000/day | fine for personal use |
| CPU time | 10 ms/request | pages are data-light; scans are I/O-bound, which does **not** count |
| Subrequests | 50/invocation | 8 sets × ~5 = ~40 |
| Worker size | 3 MiB gzipped | **0.94 MiB** |
| D1 storage | 5 GB | ~8 MB |
| D1 reads | 5M/month | far under |
| Cron triggers | 5 per account | 1 used |

**The 10 ms CPU limit is the one to watch.** Waiting on `fetch()` does not count toward it,
so scanning is safe, but if a page ever does heavy server-side computation it can trip
Error 1102. Current pages only read cached data and render, so they are well inside.

---

## Which host should you use?

**Stay on Render** if the current setup works — it is running, UptimeRobot keeps it warm,
and Neon holds the data.

**Move to Cloudflare** if you want to drop the keep-alive ping entirely. Workers have no
cold start and no spin-down, so UptimeRobot becomes unnecessary and the 750 instance-hour
budget stops mattering. The trade-off is slower catalog coverage (8 sets per 5 minutes
rather than 20 per 2 minutes) because of the subrequest cap.

You can run both: the Postgres schema stays the default, and the Cloudflare build swaps in
the D1 schema only during `npm run cf:build`.
