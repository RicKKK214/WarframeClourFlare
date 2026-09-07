import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/services/settings';

export const dynamic = 'force-dynamic';

/**
 * Settings are READ-ONLY over HTTP.
 *
 * They used to be a single shared row that any anonymous visitor could POST to, which
 * changed the platform, pricing mode and scan interval for EVERY user of the site and
 * wiped the shared order cache. Per-visitor preferences now live in the browser
 * (see src/lib/prefs.ts); genuinely global values are operator-controlled through
 * environment variables.
 */
export async function GET() {
  return NextResponse.json({ ok: true, data: await getSettings() });
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        'Settings are per-device and no longer stored on the server. Change them in ' +
        'Settings; they are saved in your browser. Server-wide defaults are set by the ' +
        'operator via environment variables.',
    },
    { status: 405 },
  );
}
