import type { WfmOrder, SetAnalysis } from '../types';

/**
 * Bulk / inventory planning.
 *
 * Everything here walks the REAL order book rather than dividing by a single price.
 * That distinction matters: on Ballistica Prime the cheapest set is 129p but the next
 * units cost 130p, 130p, 135p... so "500p / 129p = 3.8 sets" overstates what you can
 * actually buy. Walking the book gives 3 sets for 389p.
 */

/** One price level consumed while walking the book. */
export interface FillLevel {
  price: number;
  units: number;
}

export interface WalkResult {
  /** Units actually obtainable given budget and available depth. */
  units: number;
  /** Total platinum spent (buying) or received (selling). */
  total: number;
  /** Average unit price actually achieved, not the headline price. */
  avgPrice: number | null;
  levels: FillLevel[];
  /** True when the order book ran out before the budget/target did. */
  depthLimited: boolean;
}

const EMPTY: WalkResult = { units: 0, total: 0, avgPrice: null, levels: [], depthLimited: true };

/**
 * Walk sell orders cheapest-first, spending up to `budget` for at most `maxUnits`.
 * Respects each order's quantity so we never assume infinite supply at the best price.
 */
export function walkBuy(orders: WfmOrder[], budget: number, maxUnits = Infinity): WalkResult {
  const book = [...orders].sort((a, b) => a.platinum - b.platinum);
  let remaining = budget;
  let units = 0;
  let total = 0;
  const levels: FillLevel[] = [];

  for (const o of book) {
    if (units >= maxUnits) break;
    const available = Math.max(0, Math.floor(o.quantity ?? 1));
    let takenHere = 0;
    for (let i = 0; i < available; i++) {
      if (units >= maxUnits) break;
      if (remaining < o.platinum) break;
      remaining -= o.platinum;
      total += o.platinum;
      units++;
      takenHere++;
    }
    if (takenHere > 0) levels.push({ price: o.platinum, units: takenHere });
    // Stop early only if we are out of money for even the cheapest remaining level.
    if (remaining < o.platinum && units >= maxUnits) break;
  }

  const exhaustedBook = units < maxUnits && book.reduce((n, o) => n + Math.floor(o.quantity ?? 1), 0) <= units;
  return {
    units,
    total,
    avgPrice: units ? Math.round((total / units) * 100) / 100 : null,
    levels,
    depthLimited: exhaustedBook,
  };
}

/**
 * Walk buy orders highest-first to sell `units`. Used for instant-dump revenue: each
 * buyer only wants a limited quantity, so dumping 5 units rarely all clears at the top bid.
 */
export function walkSell(orders: WfmOrder[], units: number): WalkResult {
  if (units <= 0) return { ...EMPTY, depthLimited: false };
  const book = [...orders].sort((a, b) => b.platinum - a.platinum);
  let left = units;
  let total = 0;
  let sold = 0;
  const levels: FillLevel[] = [];

  for (const o of book) {
    if (left <= 0) break;
    const wanted = Math.max(0, Math.floor(o.quantity ?? 1));
    const take = Math.min(wanted, left);
    if (take > 0) {
      total += take * o.platinum;
      sold += take;
      left -= take;
      levels.push({ price: o.platinum, units: take });
    }
  }

  return {
    units: sold,
    total,
    avgPrice: sold ? Math.round((total / sold) * 100) / 100 : null,
    levels,
    depthLimited: left > 0,
  };
}

/* ------------------------------------------------------------------ */
/* Inventory: "I already own some parts"                               */
/* ------------------------------------------------------------------ */

export interface InventoryPart {
  slug: string;
  name: string;
  /** Quantity the set requires. */
  required: number;
  /** Quantity the user says they own (capped at required). */
  owned: number;
  cheapestSell: number | null;
  bestBuy: number | null;
  recommendedSell: number | null;
}

export interface InventoryPlan {
  slug: string;
  name: string;
  parts: InventoryPart[];
  ownedCount: number;
  requiredCount: number;
  complete: boolean;
  /** Platinum needed to buy only the parts still missing. */
  remainingInvestment: number | null;
  /** What the finished set is worth: instant (dump) and listed. */
  setInstantValue: number | null;
  setListingValue: number | null;
  /** Profit measured against the remaining spend only - parts already owned are sunk. */
  instantProfit: number | null;
  listingProfit: number | null;
  instantRoi: number | null;
  listingRoi: number | null;
  /**
   * What the owned parts would fetch if sold individually instead of completing the set.
   * Completing is only worthwhile if it beats this.
   */
  ownedPartsInstantValue: number | null;
  /** True when selling the parts individually beats completing the set. */
  betterToSellParts: boolean;
  missing: InventoryPart[];
  /** Missing parts with no online seller - the set cannot be completed right now. */
  unobtainable: InventoryPart[];
}

/**
 * Work out what it costs to finish a set you already hold parts of, and whether
 * finishing it actually beats selling those parts individually.
 */
export function planInventory(
  analysis: SetAnalysis,
  owned: Record<string, number>,
): InventoryPlan {
  const parts: InventoryPart[] = analysis.parts.map((p) => ({
    slug: p.slug,
    name: p.name,
    required: p.quantity,
    owned: Math.max(0, Math.min(p.quantity, Math.floor(owned[p.slug] ?? 0))),
    cheapestSell: p.cheapestSell,
    bestBuy: p.bestBuy,
    recommendedSell: p.recommendedSell,
  }));

  const requiredCount = parts.reduce((n, p) => n + p.required, 0);
  const ownedCount = parts.reduce((n, p) => n + p.owned, 0);

  const missing = parts.filter((p) => p.owned < p.required);
  const unobtainable = missing.filter((p) => p.cheapestSell === null);

  // Cost to buy what is still missing. Null if any missing part has no seller, because
  // the total would otherwise silently understate the real cost.
  let remainingInvestment: number | null = 0;
  for (const p of missing) {
    const need = p.required - p.owned;
    if (p.cheapestSell === null) { remainingInvestment = null; break; }
    remainingInvestment += p.cheapestSell * need;
  }
  if (remainingInvestment !== null) {
    remainingInvestment = Math.round(remainingInvestment * 100) / 100;
  }

  const setInstantValue = analysis.set.bestBuy;
  const setListingValue = analysis.set.recommendedSell ?? analysis.set.cheapestSell;

  const instantProfit =
    remainingInvestment !== null && setInstantValue !== null
      ? Math.round((setInstantValue - remainingInvestment) * 100) / 100
      : null;
  const listingProfit =
    remainingInvestment !== null && setListingValue !== null
      ? Math.round((setListingValue - remainingInvestment) * 100) / 100
      : null;

  // Value of what you already hold, if dumped individually right now.
  let ownedPartsInstantValue: number | null = null;
  for (const p of parts) {
    if (p.owned <= 0) continue;
    if (p.bestBuy === null) continue;
    ownedPartsInstantValue = (ownedPartsInstantValue ?? 0) + p.bestBuy * p.owned;
  }
  if (ownedPartsInstantValue !== null) {
    ownedPartsInstantValue = Math.round(ownedPartsInstantValue * 100) / 100;
  }

  // Completing is worth it only if set value minus further spend beats selling the
  // parts you already have.
  const netFromCompleting =
    setInstantValue !== null && remainingInvestment !== null
      ? setInstantValue - remainingInvestment
      : null;
  const betterToSellParts =
    netFromCompleting !== null &&
    ownedPartsInstantValue !== null &&
    ownedPartsInstantValue > netFromCompleting;

  return {
    slug: analysis.slug,
    name: analysis.name,
    parts,
    ownedCount,
    requiredCount,
    complete: ownedCount >= requiredCount,
    remainingInvestment,
    setInstantValue,
    setListingValue,
    instantProfit,
    listingProfit,
    instantRoi:
      remainingInvestment !== null && remainingInvestment > 0 && instantProfit !== null
        ? Math.round((instantProfit / remainingInvestment) * 10000) / 100
        : null,
    listingRoi:
      remainingInvestment !== null && remainingInvestment > 0 && listingProfit !== null
        ? Math.round((listingProfit / remainingInvestment) * 10000) / 100
        : null,
    ownedPartsInstantValue,
    betterToSellParts,
    missing,
    unobtainable,
  };
}
