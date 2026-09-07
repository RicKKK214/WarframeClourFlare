import type { PricingMode } from './types';

/**
 * Per-device viewing preferences.
 *
 * These used to be a single shared row on the server, so one visitor changing the pricing
 * mode changed it for everyone. They now live in the browser and are sent per request,
 * which means two people can view the same site with different settings.
 *
 * Note what is NOT here: the background refresh interval. That governs a single shared
 * scanner loop and cannot be per-visitor, so it stays operator-controlled via
 * REFRESH_INTERVAL_SECONDS.
 */
export interface Prefs {
  platform: string;
  crossplay: boolean;
  language: string;
  pricingMode: PricingMode;
  onlineOnly: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  platform: 'pc',
  crossplay: true,
  language: 'en',
  pricingMode: 'median3',
  onlineOnly: true,
};

export const PREFS_STORAGE_KEY = 'wfarb.prefs.v1';

const PRICING_MODES: PricingMode[] = ['lowest', 'median3', 'median5', 'weighted'];
const PLATFORMS = ['pc', 'ps4', 'xbox', 'switch', 'mobile'];

/** Append preferences to an API request so the server prices for THIS visitor. */
export function prefsToQuery(p: Prefs, into = new URLSearchParams()): URLSearchParams {
  into.set('platform', p.platform);
  into.set('crossplay', String(p.crossplay));
  into.set('language', p.language);
  into.set('mode_pricing', p.pricingMode);
  into.set('onlineOnly', String(p.onlineOnly));
  return into;
}

/**
 * Read preferences from a request, falling back to server defaults for anything absent
 * or invalid. Never trust the values: a bad platform string would otherwise be forwarded
 * straight to Warframe.market.
 */
export function prefsFromRequest(url: URL, fallback: Prefs): Prefs {
  const p = url.searchParams;
  const platform = p.get('platform');
  const pricing = p.get('mode_pricing');
  const language = p.get('language');
  const bool = (v: string | null, dflt: boolean) =>
    v === null ? dflt : v === 'true' ? true : v === 'false' ? false : dflt;

  return {
    platform: platform && PLATFORMS.includes(platform) ? platform : fallback.platform,
    crossplay: bool(p.get('crossplay'), fallback.crossplay),
    language: language && /^[a-z]{2,5}$/i.test(language) ? language.toLowerCase() : fallback.language,
    pricingMode:
      pricing && (PRICING_MODES as string[]).includes(pricing)
        ? (pricing as PricingMode)
        : fallback.pricingMode,
    onlineOnly: bool(p.get('onlineOnly'), fallback.onlineOnly),
  };
}

/**
 * Read this device's preferences synchronously (client only).
 * Falls back to defaults when storage is empty or unreadable.
 */
export function readPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}
