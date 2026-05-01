# Session 7c — Dev-env IPv6 localhost 426 "Upgrade Required"

**Status:** Not started
**Blocker:** post-launch; dev-env only, NOT a prod issue
**Ships:** fix for the local dev server returning HTTP 426 when hit via IPv6 localhost

## Prompt

Dev-env nuisance: IPv6 localhost returns HTTP 426 "Upgrade Required" on the Nuxt dev server.

Symptom: running `pnpm dev` and navigating to `http://localhost:3000` (which resolves to `::1` on macOS by default) returns a 426 "Upgrade Required" body instead of the app. Using `http://127.0.0.1:3000` works. Likely a Node / Nuxt / Vite handshake issue where one side advertises HTTP/2 and the other rejects the downgrade, or a host header check.

Prod is unaffected — it's behind Vercel's edge, which resolves to IPv4 + terminates TLS upstream.

### Steps

1. **Reproduce.** Start the dev server (`pnpm dev`). Hit `http://localhost:3000/` in a browser. Confirm 426.
2. **Check the source.** The `Upgrade Required` body is tiny — grep the `.nuxt/dev/` runtime or `node_modules/` for that exact string. Likely Vite or h3 middleware.
3. **Diagnose.**
   - Is Node binding IPv4-only and something's proxying via IPv6?
   - Is h3/Nitro refusing a non-upgraded request (looking for WebSocket/HTTP2 upgrade)?
   - Does setting `host: '0.0.0.0'` vs `host: '::'` in `nuxt.config.ts` change behavior?
4. **Fix.** Probably a one-liner in `nuxt.config.ts` or the dev runtime config.

### DoD

- `http://localhost:3000` renders the app on cold dev start.
- No regression on `http://127.0.0.1:3000` or on prod.

## Notes for Claude

- This is low-stakes nuisance work — don't rabbit-hole.
- The existing `.claude/launch.json` starts the dev server with `--host 0.0.0.0` which should bind both stacks. If the bug is in the handshake (not the bind), changing the host flag won't help.
- macOS version when reported: Darwin 23.6.0. Node version: check `.nvmrc` or `package.json` engines.
