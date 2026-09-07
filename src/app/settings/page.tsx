'use client';
import { useEffect, useState } from 'react';
import { Save, Monitor, RotateCcw } from 'lucide-react';
import { Card, Spinner } from '@/components/ui';
import { useStickyState } from '@/lib/useStickyState';
import { DEFAULT_PREFS, PREFS_STORAGE_KEY, type Prefs } from '@/lib/prefs';

interface Status {
  cacheEntries: number;
  refreshSeconds?: number;
  persistence?: { ok: boolean; lastError: string | null };
  uptimeSeconds?: number;
  memoryMb?: number;
  upstream: {
    base: string; requests: number; errors: number;
    rateLimited: number; queued: number; lastError: string | null;
  };
}

export default function SettingsPage() {
  const [prefs, setPrefs, { ready, reset }] = useStickyState<Prefs>(PREFS_STORAGE_KEY, DEFAULT_PREFS);
  const [draft, setDraft] = useState<Prefs>(DEFAULT_PREFS);
  const [status, setStatus] = useState<Status | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (ready) setDraft(prefs); }, [ready, prefs]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/status');
        if (r.ok) setStatus(await r.json());
      } catch { /* offline */ }
    })();
  }, []);

  const save = () => {
    setPrefs(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    // Views read preferences at fetch time, so tell them to refetch immediately.
    window.dispatchEvent(new Event('wf:refreshed'));
  };

  if (!ready) return <Card className="p-8"><Spinner /></Card>;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Settings</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <Monitor size={12} />
          Saved on this device only — changing them does not affect anyone else using the site.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-[11px] uppercase tracking-wider text-slate-400">Platform
            <select className="input" value={draft.platform}
              onChange={(e) => setDraft({ ...draft, platform: e.target.value })}>
              {['pc', 'ps4', 'xbox', 'switch', 'mobile'].map((p) => (
                <option key={p} value={p}>{p.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] uppercase tracking-wider text-slate-400">Language
            <select className="input" value={draft.language}
              onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
              {['en', 'de', 'fr', 'ru', 'es', 'pt', 'zh', 'ko', 'pl', 'uk'].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] uppercase tracking-wider text-slate-400">Pricing mode
            <select className="input" value={draft.pricingMode}
              onChange={(e) => setDraft({ ...draft, pricingMode: e.target.value as Prefs['pricingMode'] })}>
              <option value="lowest">Lowest online seller</option>
              <option value="median3">Median of lowest 3 online sellers (default)</option>
              <option value="median5">Median of lowest 5 online sellers</option>
              <option value="weighted">Weighted realistic price</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={draft.crossplay}
            onChange={(e) => setDraft({ ...draft, crossplay: e.target.checked })} />
          Cross-play enabled
        </label>

        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input className="mt-1" type="checkbox" checked={draft.onlineOnly}
            onChange={(e) => setDraft({ ...draft, onlineOnly: e.target.checked })} />
          <span>
            Only use traders who are online or in-game
            <span className="block text-[11px] text-slate-500">
              Offline players are excluded entirely. Their listings often sit stale for weeks
              and cannot be traded right now, so including them would quote prices you
              cannot actually get.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-accent" onClick={save}><Save size={14} /> Save settings</button>
          <button className="btn" onClick={() => { reset(); setDraft(DEFAULT_PREFS); }}>
            <RotateCcw size={13} /> Reset
          </button>
          {saved ? <span className="text-xs text-profit">Saved on this device.</span> : null}
        </div>
      </Card>

      <Card className="space-y-2 text-xs text-slate-400">
        <div className="text-sm font-medium text-slate-200">Server settings</div>
        <p className="text-[11px] text-slate-500">
          These are shared by everyone and set by whoever runs the site, via environment
          variables. They are not per-device because they govern one shared background
          scanner.
        </p>
        <div>
          Background refresh: <span className="font-mono text-slate-300">
            {status?.refreshSeconds ?? '—'}s
          </span> <span className="text-slate-600">(REFRESH_INTERVAL_SECONDS)</span>
        </div>
      </Card>

      <Card className="space-y-2 text-xs text-slate-400">
        <div className="text-sm font-medium text-slate-200">Upstream status</div>
        <div>Endpoint base: <span className="font-mono text-slate-300">{status?.upstream.base}</span></div>
        <div>
          Requests: {status?.upstream.requests ?? 0} · errors: {status?.upstream.errors ?? 0} ·
          429s: {status?.upstream.rateLimited ?? 0} · queued: {status?.upstream.queued ?? 0}
        </div>
        <div>Cache entries: {status?.cacheEntries ?? 0}</div>
        {status?.upstream.lastError ? (
          <div className="text-loss">Last error: {status.upstream.lastError}</div>
        ) : null}
        <div className="pt-1">
          {status?.persistence && !status.persistence.ok ? (
            <div className="rounded border border-amber-400/40 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-300">
              Storage is unavailable on this instance. The scanner works normally from live
              Warframe.market data, but scanned results will not survive a restart.
            </div>
          ) : (
            <div className="rounded border border-edge bg-panel2/50 px-3 py-2 text-[11px] text-slate-400">
              Scanned market data is cached in PostgreSQL and restored after a restart.
            </div>
          )}
        </div>
        <p className="pt-2 text-[11px] text-slate-500">
          Uptime {status?.uptimeSeconds ?? 0}s · memory {status?.memoryMb ?? 0} MB.
        </p>
        <p className="pt-2 text-[11px] text-slate-500">
          Requests are queued server-side at ~3 requests/second with exponential backoff on
          HTTP 429. Catalog and set composition are cached for 12 hours; live orders for ~90
          seconds.
        </p>
      </Card>
    </div>
  );
}
