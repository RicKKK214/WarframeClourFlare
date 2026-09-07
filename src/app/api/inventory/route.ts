import { NextResponse } from 'next/server';
import { scanner } from '@/lib/services/ScannerService';
import { planInventory } from '@/lib/services/BulkPlanner';


export const dynamic = 'force-dynamic';

/**
 * "I already own some of these parts - is it worth completing the set?"
 *
 * Body: { slug: string, owned: Record<partSlug, count> }
 *
 * Profit is measured against the REMAINING spend only: parts you already hold are sunk
 * cost. It also compares against simply selling those parts individually, because
 * completing a set is not automatically the better move.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const owned = (body.owned ?? {}) as Record<string, number>;

  if (!slug) {
    return NextResponse.json({ ok: false, error: 'A set slug is required.' }, { status: 400 });
  }
  if (typeof owned !== 'object' || Array.isArray(owned)) {
    return NextResponse.json({ ok: false, error: 'owned must be an object.' }, { status: 400 });
  }

  await scanner.hydrate().catch(() => 0);

  let analysis = scanner.list().find((a) => a.slug === slug) ?? null;
  if (!analysis) {
    // Not scanned yet - fetch it on demand so any set works, not just cached ones.
    analysis = await scanner.analyseOne(slug).catch(() => null);
  }
  if (!analysis) {
    return NextResponse.json(
      { ok: false, error: `No market data for "${slug}".` },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, plan: planInventory(analysis, owned) });
}
