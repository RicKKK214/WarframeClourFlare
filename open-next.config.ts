import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext adapter config for Cloudflare Workers.
 *
 * Left intentionally minimal. Incremental cache and tag cache are NOT enabled because this
 * app has no ISR pages — every route is dynamic and reads from D1 or the in-memory cache,
 * so adding an R2/KV cache layer would cost quota without changing behaviour.
 */
export default defineCloudflareConfig();
