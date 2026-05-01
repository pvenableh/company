# Session 17 — Residual leak cleanup (post-launch hardening)

**Status:** Not started
**Blocker:** none — Sessions covering messages/appointments/organizations + the broader Client/Carddesk write sweep already shipped (commits `a63ef1f` + `be59f89` on main).
**Ships:** server routes for 4 remaining FK-walk-create collections, pnpm `uuid` override (or documented decision to skip), and a Directus admin cleanup of one stale field.
**Gating:** post-launch, not launch-blocking.

## Context — what's already closed

Two-phase leak-close already shipped 2026-04-30. Full memo:
`~/.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/project_messages_appointments_leak_close.md`. Critical findings the next session needs:

1. **Directus 11 quirk:** `permissions` filter is NOT enforced on the `create` action — only `validation` is. `validation` enforces direct-field comparisons (including `$CURRENT_USER.organizations.organizations_id` substitution) but NOT FK walks. Memo: `~/.claude/projects/.../memory/reference_directus11_create_perm_quirk.md`.
2. **Pattern for FK-walk-create closure:** route writes through admin-token server endpoints with `requireOrgMembership` checks (helper at `server/utils/marketing-perms.ts`), then revoke the user-policy create perm. Templates: `server/api/messages/index.post.ts` + `server/api/appointments/index.post.ts`.

## Residual #1 — 4 FK-walk-create collections still bypassable

`scripts/patch-tenant-write-perms.ts` left these create perms with `permissions` filter as documentation only — Directus doesn't enforce FK walks on create, so a malicious authenticated user with a foreign tenant's UUID can pollute the foreign tenant's data:

| Collection | Read scope (FK walk) | Client-side write call sites |
|---|---|---|
| `comments` | `user.organizations.organizations_id._in` | grep for `useDirectusItems('comments')\.create` |
| `contact_connections` | `client.organization._in` | grep for `useDirectusItems('contact_connections')\.create` |
| `team_goals` | `team.organization._in` | grep for `useDirectusItems('team_goals')\.create` |
| `ai_chat_messages` | `session.user._eq` | grep for `useDirectusItems('ai_chat_messages')\.create` |

**Practical barrier today:** UUIDs are 122-bit random — not enumerable. So this is theoretical exposure, but the user's directive is "fix all bugs and leaks."

**Fix per collection:**
1. Find every `<entityItems>.create(...)` call site.
2. Build `server/api/<collection>/index.post.ts` mirroring the messages/appointments templates. Validate the FK target's org membership (e.g. for comments, look up the parent entity by `(collection, item)` polymorphic ref and call `requireOrgMembership` on its `organization`). For ai_chat_messages, look up the session and confirm `session.user === current user`.
3. Replace the call sites with `$fetch('/api/<collection>', { method: 'POST', body: ... })`.
4. Delete the Client Manager + Client + Carddesk create perms for the collection (extend `scripts/patch-tenant-write-perms.ts` with a CLIENT_MANAGER_DROP_TARGETS / etc. block, same shape as the messages/appointments fix).
5. Verify: a) direct `POST /items/<collection>` 403s, b) cross-tenant create via the server route 403s, c) own-tenant create via the server route 200s.

**`comments` complexity:** it's polymorphic (`collection` + `item` fields name the parent). Validation logic must look up the parent entity in its named collection and walk to `organization`. Cover at minimum: `tickets`, `projects`, `tasks`, `leads`, `proposals`, `clients`, `invoices`, `messages`, `appointments`. If the parent entity itself has no org FK (e.g. messages → walk through `channel.organization`), reuse the same FK walk. If validation is too painful for ai_chat_messages, an alternative is to drop client-side creates entirely — the AI chat backend already creates messages server-side (check `server/api/ai/`) and the only client-side `ai_chat_messages.create` may be for user-typed messages that could route through the existing AI endpoint.

## Residual #2 — Transitive `uuid` versions

After commit `be59f89` removed the direct `uuid` devDep, two transitive vulnerable versions remain:
```
@azure/msal-node 3.8.10 → uuid 8.3.2
bullmq 5.73.5         → uuid 11.1.0
```

Three options, in order of preference:

1. **Wait for upstream bumps.** Check `npm-check-updates` periodically — when `@azure/msal-node` releases a version that depends on uuid ≥14, bump. Same for bullmq.
2. **pnpm `overrides` to force uuid@14.** Add to `package.json`:
   ```json
   "pnpm": { "overrides": { "uuid": "^14.0.0" } }
   ```
   **Risk:** v9→v14 is two majors. Test that msal-node still authenticates (the OAuth flow through `server/api/auth/`) and that bullmq queue ops still work. The advisory is specifically about `v3/v5/v6` — neither library uses those modes (msal-node uses `v4`, bullmq uses `v4`/random) so the override is functionally a no-op for them, but the API surface must still match.
3. **Document and dismiss.** Mark Dependabot alert #2 as "tolerable risk" via `gh api ... -X PATCH` with `state: dismissed`, `dismissed_reason: tolerable_risk`. Justification: v3/v5/v6 buffer-bounds bug doesn't apply to v4 usage.

Recommend option 1 short-term + option 3 if upstream bumps lag.

## Residual #3 — `video_meetings.organization` stale field

The Directus collection has TWO org FK fields: `organization` and `related_organization`. Only `related_organization` is the canonical one (used in row perms, set by all server code). `organization` is orphan metadata that caused a perm-eval 500 mid-fix on 2026-04-30 (see `scripts/patch-tenant-row-perms.ts:121-124` comment).

**Fix:** delete the field via Directus API:
```bash
curl -X DELETE "$DIRECTUS_URL/fields/video_meetings/organization" \
  -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN"
```
Then grep for any references to `video_meetings.organization` in the codebase (should be zero — but verify) and re-run the audit.

## DoD

- All four FK-walk collections route writes through server endpoints; user-policy create perms revoked. `scripts/audit-tenant-row-perms.ts` reports 0 unscoped writes (already true) AND a manual smoke test confirms direct `POST /items/<col>` 403s for each collection.
- `uuid` Dependabot alert closed (either by upstream bump, override + retest, or formal dismissal).
- `video_meetings.organization` field removed from the Directus schema; codebase grep returns no matches.
- Memory updated: append a closure note to `project_messages_appointments_leak_close.md`.

## Reference files

- `scripts/audit-tenant-row-perms.ts` — extended audit (reads + writes)
- `scripts/patch-tenant-write-perms.ts` — write-perm closure pattern
- `scripts/patch-messages-appointments-perms.ts` — server-route + perm-revoke pattern
- `server/utils/marketing-perms.ts` — `requireOrgMembership(event, orgId)` helper
- `server/api/messages/index.post.ts` + `server/api/appointments/index.post.ts` — templates
- `~/.claude/projects/.../memory/reference_directus11_create_perm_quirk.md` — quirk reference
- `~/.claude/projects/.../memory/project_messages_appointments_leak_close.md` — full memo

## Notes for Claude

- Run against prod `admin.earnest.guru`. Backup affected perm rows before mutating: `curl -sG "$DIRECTUS_URL/permissions" --data-urlencode 'filter[collection][_in][]=comments' --data-urlencode 'filter[collection][_in][]=contact_connections' --data-urlencode 'filter[collection][_in][]=team_goals' --data-urlencode 'filter[collection][_in][]=ai_chat_messages' --data-urlencode 'fields=*,policy.name' --data-urlencode 'limit=-1' -H "Authorization: Bearer $DIRECTUS_SERVER_TOKEN" > docs/perms-backup-$(date +%F)-fk-walk-creates.json`.
- Demo creds: `DEMO_USER_PASSWORD` (Solo, org `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e`) + `DEMO_AGENCY_USER_PASSWORD` (Agency, org `d409875b-01d7-4f85-84c8-01c9badbb338`).
- Dev server: use `http://127.0.0.1:<port>`, not `localhost` (memory `reference_dev_server_ipv6.md`).
- Worktree note: pnpm dev needs to run from `/Users/peterhoffman/Sites/earnest/earnest` (parent), not the worktree, since worktrees lack `node_modules`. Configure `.claude/launch.json` accordingly OR add a launch.json that does `cd` into the parent in the runtimeArgs (don't commit the worktree-specific version).
- Comments polymorphism: parent entities and their FK paths to `organization` are catalogued in `server/utils/entity-context.ts` — reuse that map rather than rebuilding it.
