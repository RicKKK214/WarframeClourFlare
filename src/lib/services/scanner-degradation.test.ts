import { describe, it, expect, vi } from 'vitest';

/**
 * Regression tests for the two ways this app used to hard-fail instead of degrading.
 *
 * 1. `new PrismaClient()` at module scope threw when the client had not been generated,
 *    which broke `next build` outright ("Failed to collect page data for /api/cron/scan")
 *    even though persistence is optional everywhere else.
 * 2. `scanner.scan()` propagated a catalog fetch failure, so an unreachable
 *    Warframe.market turned every request into a 5xx rather than serving cached results.
 */

// Simulate an ungenerated / broken Prisma client: constructing it throws.
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      throw new Error('@prisma/client did not initialize yet. Please run "prisma generate"');
    }
  },
}));

// The catalog is the first upstream call in a scan; make it always fail.
vi.mock('./ItemCatalogService', () => ({
  itemCatalog: {
    getPrimeSets: () => Promise.reject(new Error('fetch failed')),
    search: () => Promise.reject(new Error('fetch failed')),
  },
}));

describe('prisma client is constructed lazily', () => {
  it('importing the db module does not throw when the client is not generated', async () => {
    await expect(import('../db')).resolves.toBeTruthy();
  });

  it('a query against an unconstructable client degrades to the fallback', async () => {
    const { withDb, prisma } = await import('../db');
    const r = await withDb(() => (prisma as never as { watchlist: { findMany: () => Promise<unknown> } }).watchlist.findMany(), [], 'read');
    expect(r).toEqual([]);
  });

  it('probeDb reports unhealthy rather than throwing', async () => {
    const { probeDb } = await import('../db');
    const h = await probeDb();
    expect(h.ok).toBe(false);
  });
});

describe('scan() survives an unreachable upstream', () => {
  it('resolves instead of rejecting when the catalog cannot be fetched', async () => {
    const { scanner } = await import('./ScannerService');
    const state = await scanner.scan({ limit: 1 });
    expect(state.running).toBe(false);
    expect(state.errors).toBeGreaterThan(0);
    expect(state.lastError).toContain('catalog');
  });

  it('counts the failure so the restart backoff engages', async () => {
    const { scanner } = await import('./ScannerService');
    const before = scanner.state.consecutiveFailures;
    await scanner.scan({ limit: 1 });
    expect(scanner.state.consecutiveFailures).toBeGreaterThan(before);
  });

  it('does not mark the scanner warm on a failed pass', async () => {
    const { scanner } = await import('./ScannerService');
    await scanner.scan({ limit: 1 });
    expect(scanner.state.warm).toBe(false);
  });
});
