// server/api/version.get.ts
// Reports the build identity of the currently-running server process. The
// client (plugins/app-update.client.ts) polls this and compares it to the
// buildId baked into its own bundle; a mismatch means a newer deploy is live.
//
// Deliberately cheap and uncached so a fresh deploy is detected promptly.
export default defineEventHandler((event) => {
  setResponseHeader(event, "cache-control", "no-store, max-age=0");
  const config = useRuntimeConfig();
  return {
    buildId: config.public.buildId,
    // Semantic release version (package.json) — the human-readable label the
    // client shows next to the freshness check. The buildId remains the actual
    // per-deploy freshness signal; version only changes when we bump it.
    version: config.public.appVersion,
  };
});
