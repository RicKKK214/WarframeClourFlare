import { NextResponse } from 'next/server';
import { scanner } from '@/lib/services/ScannerService';

export const dynamic = 'force-dynamic';

/**
 * Scan trigger for serverless hosts (Cloudflare Cron Triggers, GitHub Actions, cron-job.org).
 *
 * WHY THIS EXISTS
 * On Render the scanner runs a `setTimeout` loop inside a long-lived process. Cloudflare
 * Workers have no such process: the isolate is destroyed once a response is sent, so a
 * background timer silently never fires. The scan therefore has to be *pulled* by a cron
 * trigger rather than *pushed* by the app.
 *
 * SUBREQUEST BUDGET
 * Each set costs roughly one fetch per part plus one for the set (~5 total). Cloudflare
 * allows 50 subrequests per invocation on the Free plan and 1,000 on Paid, so the batch
 * size must stay small — hence CRON_BATCH_LIMIT, defaulting to a deliberately conservative
 * 8 sets (~40 fetches). The scanner rotates through the catalog, so successive cron runs
 * cover different sets and the whole catalog is refreshed over time.
 *
 * SECURITY
 * If CRON_SECRET is set, the request must present it. Without that, anyone could hammer
 * this endpoint and burn both your Worker quota and Warframe.market's rate limit.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const provided =
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      url.searchParams.get('key') ??
      '';
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
    }
  }

  const limit = Number(process.env.CRON_BATCH_LIMIT ?? 8);

  await scanner.hydrate().catch(() => 0);
  const state = await scanner.scan({ limit: Number.isFinite(limit) && limit > 0 ? limit : 8 });

  return NextResponse.json({
    ok: true,
    scanned: state.processed,
    errors: state.errors,
    totalInBatch: state.total,
    setsInMemory: scanner.list().length,
    note:
      'Batch size is bounded by the host subrequest limit (Cloudflare Free allows 50 per ' +
      'invocation). The scanner rotates through the catalog across runs.',
  });
}
