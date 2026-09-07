#!/usr/bin/env node
/**
 * Generate the D1 schema SQL from prisma/schema.d1.prisma.
 *
 * D1 cannot be reached over TCP, so `prisma db push` does not work against it. The
 * supported path is to emit plain SQL and apply it with wrangler:
 *
 *   npm run cf:d1:sql          # writes prisma/d1-schema.sql
 *   npx wrangler d1 execute wfarb --remote --file=prisma/d1-schema.sql
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'prisma/d1-schema.sql';

try {
  const sql = execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema-datamodel',
      'prisma/schema.d1.prisma',
      '--script',
    ],
    { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'file:./d1.db' } },
  );

  mkdirSync('prisma', { recursive: true });
  writeFileSync(OUT, sql);
  console.log(`[cf] wrote ${OUT} (${sql.split('\n').length} lines)`);
  console.log('[cf] apply it with:');
  console.log(`     npx wrangler d1 execute wfarb --remote --file=${OUT}`);
} catch (e) {
  console.error('[cf] failed to generate D1 schema:', e instanceof Error ? e.message : e);
  process.exit(1);
}
