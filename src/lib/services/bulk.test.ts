import { describe, it, expect } from 'vitest';
import { walkBuy, walkSell, planInventory } from './BulkPlanner';
import type { WfmOrder, SetAnalysis, PartLine } from '../types';

const order = (platinum: number, quantity = 1): WfmOrder =>
  ({ id: `o${platinum}x${quantity}`, type: 'sell', platinum, quantity, visible: true,
     user: { ingameName: 'u', status: 'ingame', platform: 'pc', crossplay: true } }) as unknown as WfmOrder;

const part = (p: Partial<PartLine> = {}): PartLine => ({
  slug: 'p1', name: 'Part One', quantity: 1,
  cheapestSell: 10, recommendedSell: 11, bestBuy: 8, sellers: 5, buyers: 5, ...p,
});

const analysis = (p: Partial<SetAnalysis> = {}): SetAnalysis => ({
  slug: 's_prime_set', name: 'S Prime Set', category: 'warframe', partCount: 2,
  parts: [part(), part({ slug: 'p2', name: 'Part Two' })],
  set: { cheapestSell: 100, recommendedSell: 100, bestBuy: 90, sellers: 10, buyers: 10 },
  partsCost: 20, partsSaleValue: 22, partsInstantValue: 16,
  strategies: [], bestStrategy: null, confidence: 80, confidenceLabel: 'High',
  updatedAt: Date.now(), ...p,
});

describe('walkBuy — real order-book depth', () => {
  it('walks up the book instead of assuming infinite supply at the best price', () => {
    // Naive maths: 500 / 129 = 3 sets for 387p. Reality: the 129p seller has only one.
    const book = [order(129, 1), order(130, 2), order(135, 10)];
    const r = walkBuy(book, 500);
    expect(r.units).toBe(3);
    expect(r.total).toBe(129 + 130 + 130);
    expect(r.avgPrice).toBeCloseTo(129.67, 1);
  });

  it('reports the average actually paid, above the headline price', () => {
    const r = walkBuy([order(10, 1), order(20, 1)], 100);
    expect(r.avgPrice).toBe(15);
    expect(r.avgPrice).toBeGreaterThan(10);
  });

  it('stops when the budget runs out mid-book', () => {
    const r = walkBuy([order(40, 5)], 100);
    expect(r.units).toBe(2);
    expect(r.total).toBe(80);
  });

  it('flags depth-limited when the book is exhausted before the budget', () => {
    const r = walkBuy([order(10, 2)], 1000);
    expect(r.units).toBe(2);
    expect(r.depthLimited).toBe(true);
  });

  it('respects a maximum unit cap', () => {
    const r = walkBuy([order(10, 100)], 1000, 3);
    expect(r.units).toBe(3);
  });

  it('buys nothing when the cheapest listing exceeds the budget', () => {
    const r = walkBuy([order(500, 1)], 100);
    expect(r.units).toBe(0);
    expect(r.total).toBe(0);
    expect(r.avgPrice).toBeNull();
  });
});

describe('walkSell — buyer demand is finite', () => {
  it('fills the highest bids first', () => {
    const r = walkSell([order(50, 1), order(40, 2)], 3);
    expect(r.total).toBe(50 + 40 + 40);
    expect(r.units).toBe(3);
  });

  it('flags depth-limited when buyers cannot absorb everything', () => {
    const r = walkSell([order(50, 1)], 5);
    expect(r.units).toBe(1);
    expect(r.depthLimited).toBe(true);
  });

  it('returns nothing when there are no buy orders', () => {
    const r = walkSell([], 3);
    expect(r.units).toBe(0);
    expect(r.total).toBe(0);
  });
});

describe('planInventory', () => {
  it('charges only for the parts still missing', () => {
    const a = analysis({
      parts: [
        part({ slug: 'a', cheapestSell: 35 }),
        part({ slug: 'b', cheapestSell: 19 }),
        part({ slug: 'c', cheapestSell: 4 }),
      ],
      partCount: 3,
    });
    const plan = planInventory(a, { a: 1, b: 1 });
    expect(plan.ownedCount).toBe(2);
    expect(plan.requiredCount).toBe(3);
    expect(plan.remainingInvestment).toBe(4); // only part c
  });

  it('measures profit against the remaining spend, treating owned parts as sunk', () => {
    const a = analysis({
      parts: [part({ slug: 'a', cheapestSell: 90 }), part({ slug: 'b', cheapestSell: 10 })],
      set: { cheapestSell: 130, recommendedSell: 130, bestBuy: 120, sellers: 9, buyers: 9 },
    });
    const plan = planInventory(a, { a: 1 });
    expect(plan.remainingInvestment).toBe(10);
    expect(plan.instantProfit).toBe(110); // 120 - 10, not 120 - 100
  });

  it('handles quantity > 1 parts', () => {
    const a = analysis({ parts: [part({ slug: 'a', quantity: 3, cheapestSell: 5 })], partCount: 1 });
    const plan = planInventory(a, { a: 1 });
    expect(plan.requiredCount).toBe(3);
    expect(plan.remainingInvestment).toBe(10); // 2 still needed
  });

  it('caps owned at the required quantity', () => {
    const a = analysis({ parts: [part({ slug: 'a', quantity: 2, cheapestSell: 5 })], partCount: 1 });
    const plan = planInventory(a, { a: 99 });
    expect(plan.ownedCount).toBe(2);
    expect(plan.remainingInvestment).toBe(0);
    expect(plan.complete).toBe(true);
  });

  it('cannot price a set when a missing part has no seller', () => {
    const a = analysis({
      parts: [part({ slug: 'a', cheapestSell: null }), part({ slug: 'b', cheapestSell: 10 })],
    });
    const plan = planInventory(a, { b: 1 });
    expect(plan.remainingInvestment).toBeNull();
    expect(plan.unobtainable).toHaveLength(1);
    expect(plan.instantProfit).toBeNull();
  });

  it('warns when selling the parts individually beats completing the set', () => {
    // Owned parts are worth 200 dumped; completing nets only 130 - 10 = 120.
    const a = analysis({
      parts: [part({ slug: 'a', bestBuy: 200 }), part({ slug: 'b', cheapestSell: 10, bestBuy: 1 })],
      set: { cheapestSell: 130, recommendedSell: 130, bestBuy: 130, sellers: 5, buyers: 5 },
    });
    const plan = planInventory(a, { a: 1 });
    expect(plan.ownedPartsInstantValue).toBe(200);
    expect(plan.betterToSellParts).toBe(true);
  });

  it('does not warn when completing the set is the better move', () => {
    const a = analysis({
      parts: [part({ slug: 'a', bestBuy: 5 }), part({ slug: 'b', cheapestSell: 10, bestBuy: 1 })],
      set: { cheapestSell: 130, recommendedSell: 130, bestBuy: 130, sellers: 5, buyers: 5 },
    });
    const plan = planInventory(a, { a: 1 });
    expect(plan.betterToSellParts).toBe(false);
  });

  it('treats an empty inventory as owning nothing', () => {
    const a = analysis({ parts: [part({ slug: 'a', cheapestSell: 7 }), part({ slug: 'b', cheapestSell: 3 })] });
    const plan = planInventory(a, {});
    expect(plan.ownedCount).toBe(0);
    expect(plan.remainingInvestment).toBe(10);
  });
});

