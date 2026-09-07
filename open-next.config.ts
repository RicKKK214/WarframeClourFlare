import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext adapter config for Cloudflare Workers.
 *
 * Incremental/tag caches are intentionally not enabled: every route here is dynamic and
 * reads from D1 or the in-memory cache, so an R2/KV cache layer would burn quota without
 * changing behaviour.
 */
const config = defineCloudflareConfig();

/**
 * Override the build command.
 *
 * OpenNext otherwise runs `npm run build`, which is the RENDER build
 * (`prisma generate` against prisma/schema.prisma = PostgreSQL). That would overwrite the
 * D1 client and produce a Worker that cannot talk to its own database — a failure that
 * only shows up at runtime, after a successful-looking deploy. Generating from the D1
 * schema here keeps the two targets separate.
 *
 * `buildCommand` is a top-level OpenNext option, not part of CloudflareOverrides, so it is
 * attached after defineCloudflareConfig() rather than passed into it.
 */
export default {
  ...config,
  buildCommand: 'prisma generate --schema prisma/schema.d1.prisma && next build',
};
