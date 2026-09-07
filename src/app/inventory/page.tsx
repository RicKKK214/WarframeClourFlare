'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Boxes, AlertTriangle, Check, X } from 'lucide-react';
import { Card, Spinner, Money, Roi, EmptyState, Disclaimer } from '@/components/ui';
import { plat } from '@/lib/utils';
import { useStickyState } from '@/lib/useStickyState';

interface InvPart {
  slug: string; name: string; required: number; owned: number;
  cheapestSell: number | null; bestBuy: number | null; recommendedSell: number | null;
}
interface InvPlan {
  slug: string; name: string; parts: InvPart[];
  ownedCount: number; requiredCount: number; complete: boolean;
  remainingInvestment: number | null;
  setInstantValue: number | null; setListingValue: number | null;
  instantProfit: number | null; listingProfit: number | null;
  instantRoi: number | null; listingRoi: number | null;
  ownedPartsInstantValue: number | null; betterToSellParts: boolean;
  missing: InvPart[]; unobtainable: InvPart[];
}

/** Saved inventory: { setSlug: { partSlug: count } }, kept on this device only. */
const STORAGE_KEY = 'wfarb.inventory.v1';
type Saved = { sets: Record<string, Record<string, number>> };

export default function InventoryPage() {
  const [q, setQ] = useState('');
  const [sets, setSets] = useState<{ slug: string; name: string }[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [plan, setPlan] = useState<InvPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved, { ready }] = useStickyState<Saved>(STORAGE_KEY, { sets: {} });

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch('/api/sets');
        const j = await r.json();
        if (!dead) {
          setSets((j.data ?? []).map((s: { slug: string; name: string }) => ({ slug: s.slug, name: s.name })));
        }
      } catch { /* catalog unavailable */ }
    })();
    return () => { dead = true; };
  }, []);

  const compute = useCallback(async (s: string, inv: Record<string, number>) => {
    setLoading(true);
    try {
      const r = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: s, owned: inv }),
      });
      const j = await r.json();
      if (j.ok) setPlan(j.plan);
    } finally { setLoading(false); }
  }, []);

  const pick = async (s: string) => {
    setSlug(s); setQ('');
    await compute(s, saved.sets[s] ?? {});
  };

  const toggle = async (partSlug: string, required: number) => {
    if (!slug) return;
    const current = saved.sets[slug] ?? {};
    const next = { ...current, [partSlug]: current[partSlug] ? 0 : required };
    // Persist so a part list you spent time ticking is still there next visit.
    setSaved({ ...saved, sets: { ...saved.sets, [slug]: next } });
    await compute(slug, next);
  };

  const clearSet = async () => {
    if (!slug) return;
    const nextSets = { ...saved.sets };
    delete nextSets[slug];
    setSaved({ ...saved, sets: nextSets });
    await compute(slug, {});
  };

  const matches = q.trim()
    ? sets.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : [];

  const savedSlugs = ready
    ? Object.entries(saved.sets)
        .filter(([, parts]) => Object.values(parts).some((n) => n > 0))
        .map(([s]) => s)
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
          <Boxes size={20} className="text-accent2" /> I own these parts
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Tick the parts you already have. Only the missing ones are costed — parts you own
          are a sunk cost, so they are not charged against your profit again.
        </p>
      </div>

      <Card className="space-y-2">
        <label className="space-y-1 text-[11px] uppercase tracking-wider text-slate-400">
          Which set?
          <input
            className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search — e.g. Ballistica Prime"
          />
        </label>
        {matches.length ? (
          <div className="divide-y divide-slate-800 rounded border border-slate-800">
            {matches.map((s) => (
              <button
                key={s.slug} onClick={() => void pick(s.slug)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800/50"
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}

        {savedSlugs.length && !slug ? (
          <div className="pt-1">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">
              Saved on this device
            </div>
            <div className="flex flex-wrap gap-2">
              {savedSlugs.map((s) => (
                <button
                  key={s} onClick={() => void pick(s)}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-accent/50"
                >
                  {sets.find((x) => x.slug === s)?.name ?? s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {loading && !plan ? <Card className="py-8"><Spinner /></Card> : null}

      {plan ? (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/sets/${plan.slug}`} className="font-medium text-slate-100 hover:text-accent2">
                {plan.name}
              </Link>
              <span className={`text-sm ${plan.complete ? 'text-profit' : 'text-slate-400'}`}>
                You own {plan.ownedCount}/{plan.requiredCount} parts
              </span>
              {plan.ownedCount > 0 ? (
                <button onClick={() => void clearSet()} className="ml-auto text-[11px] text-slate-500 hover:text-slate-300">
                  <X size={11} className="inline" /> clear
                </button>
              ) : null}
            </div>

            <div className="space-y-1">
              {plan.parts.map((p) => {
                const has = p.owned >= p.required;
                return (
                  <button
                    key={p.slug}
                    onClick={() => void toggle(p.slug, p.required)}
                    className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm transition-colors ${
                      has ? 'border-profit/40 bg-profit/5 text-slate-200'
                          : 'border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm border ${
                      has ? 'border-profit bg-profit/20 text-profit' : 'border-slate-600'}`}>
                      {has ? <Check size={11} /> : null}
                    </span>
                    <span className="flex-1">{p.name}</span>
                    {p.required > 1 ? <span className="text-[10px] text-slate-500">×{p.required}</span> : null}
                    <span className="font-mono text-xs text-slate-500">
                      {p.cheapestSell === null ? 'no sellers' : `${p.cheapestSell}p`}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-2 font-mono text-sm">
            {plan.unobtainable.length ? (
              <div className="flex items-start gap-2 rounded border border-amber-400/30 bg-amber-400/5 px-3 py-2 font-sans text-[11px] text-amber-300">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {plan.unobtainable.length} missing part(s) have no online seller right now, so
                the set cannot be completed and no cost is shown.
              </div>
            ) : null}

            <Row label="Remaining investment" value={plat(plan.remainingInvestment)} />
            <Row label="Expected set value (instant)" value={plat(plan.setInstantValue)} />
            <Row label="Expected set value (listed)" value={plat(plan.setListingValue)} />
            <div className="my-1 border-t border-slate-800" />
            <ProfitRow label="Potential profit (instant)" value={plan.instantProfit} roi={plan.instantRoi} />
            <ProfitRow label="Potential profit (listed)" value={plan.listingProfit} roi={plan.listingRoi} />

            {plan.betterToSellParts ? (
              <div className="mt-2 flex items-start gap-2 rounded border border-amber-400/30 bg-amber-400/5 px-3 py-2 font-sans text-[11px] text-amber-300">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                Selling your parts individually ({plat(plan.ownedPartsInstantValue)}) beats
                completing the set. Completing is not worth it right now.
              </div>
            ) : plan.ownedPartsInstantValue !== null ? (
              <p className="mt-2 font-sans text-[11px] text-slate-500">
                Your parts would fetch {plat(plan.ownedPartsInstantValue)} sold individually.
                Profit above counts only the remaining spend.
              </p>
            ) : null}
          </Card>
        </>
      ) : !loading && slug === null ? (
        <EmptyState title="Pick a set to begin" hint="Search above, then tick the parts you own." />
      ) : null}

      <Disclaimer />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-sans text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}

function ProfitRow({ label, value, roi }: { label: string; value: number | null; roi: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-sans text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <span className="flex items-center gap-2">
        <Money value={value} signed />
        {roi !== null ? <Roi value={roi} /> : null}
      </span>
    </div>
  );
}
