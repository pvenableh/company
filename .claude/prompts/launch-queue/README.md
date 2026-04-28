# Launch queue

Self-contained Claude prompts for the sessions remaining before public launch of `app.earnest.guru`. Each file is a standalone paste-into-Claude prompt — Claude on any device (iPad, laptop, Codespace, claude.ai/code, SSH) can pick one up cold and run it.

## Why these live in the repo

Claude's per-project memory at `~/.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/` is **local to one machine**. It does not sync. These launch-queue prompts live in-repo so you can work from an iPad (GitHub web UI, Working Copy, Codespaces, etc.) and any Claude instance can see the full plan.

If you fire one of these prompts from a device that doesn't have the Mac's memory files, Claude will still have enough context because each prompt is self-contained. But it won't know about incidental project memories (UI preferences, past incidents, etc.) — so responses may be more generic than usual until it reads the current code.

## Order of execution

Sessions are numbered roughly by ship order. Hard dependencies are noted in each file.

| Session | File | Blocker |
| ------- | ---- | ------- |
| 4 | [session-4-archive-schema.md](session-4-archive-schema.md) | none |
| 5 | [session-5-archive-gating.md](session-5-archive-gating.md) | Session 4 must be shipped |
| 6 | [session-6-smoke-test.md](session-6-smoke-test.md) | Sessions 1–5 all shipped (note deferrals in the smoke report) |
| 8 | [session-8-tenant-perm-patch.md](session-8-tenant-perm-patch.md) | none — but ship before opening signups (real cross-tenant leak fix; smoke-report blocker) |
| 9 | [session-9-onboarding-completion.md](session-9-onboarding-completion.md) | Session 8 should ship first |
| 10 | [session-10-empty-states-and-cleanup.md](session-10-empty-states-and-cleanup.md) | Sessions 8 + 9 should ship first |
| 7a | [session-7a-c2-deferred.md](session-7a-c2-deferred.md) | post-launch; needs null-org backfill script run first |
| 7b | [session-7b-chat-sessions-cold-load.md](session-7b-chat-sessions-cold-load.md) | post-launch |
| 7c | [session-7c-ipv6-localhost.md](session-7c-ipv6-localhost.md) | post-launch; dev-env only |
| 7d | [session-7d-contact-orgs-fk.md](session-7d-contact-orgs-fk.md) | post-launch; only if partner-activation UX develops friction |

Sessions 1–3 are upstream of this queue and are not reproduced here. Per the handoff note, "Sessions 2 and 3 can run in parallel if the user drives OAuth console updates while Stripe code work happens." If you need those prompts back, they would have been in an earlier planning conversation — check the Mac's memory files or past Claude sessions.

## How to use a session prompt on iPad

1. Open the session file in the GitHub web UI (or any markdown viewer).
2. Copy everything under the **Prompt** heading — that block is written to be self-contained.
3. Paste it into a fresh Claude conversation (claude.ai/code, a Codespace, wherever you're running Claude).
4. Claude will read the repo at the current HEAD and execute.
5. After the session ships, open this README and strike the line through in the table, or delete the file.

## Meta-notes for future Claude instances reading this

- Working directory: `/Users/peterhoffman/Sites/earnest/earnest` (if the Mac is hosting), or whatever the Codespace/remote mounts as. Resolve paths against the current repo root, not hard-coded `/Users/...`.
- Prod domain: `app.earnest.guru` (app), `admin.earnest.guru` (Directus), `earnest.guru` (marketing, separate repo).
- Do NOT hard-delete organizations through user flows — archive-first. That's the premise of Sessions 4 + 5.
- Phase C₂ previously audited 14 composables for org-scoping; Session 5 extends the same pattern to the remaining surfaces.
