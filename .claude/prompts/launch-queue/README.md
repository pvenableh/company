# Launch queue

Self-contained Claude prompts for upcoming sessions on Earnest. Each file is a standalone paste-into-Claude prompt — Claude on any device (iPad, laptop, Codespace, claude.ai/code, SSH) can pick one up cold and run it.

## Why these live in the repo

Claude's per-project memory at `~/.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/` is **local to one machine**. It does not sync. These launch-queue prompts live in-repo so you can work from an iPad (GitHub web UI, Working Copy, Codespaces, etc.) and any Claude instance can see the full plan.

If you fire one of these prompts from a device that doesn't have the Mac's memory files, Claude will still have enough context because each prompt is self-contained. But it won't know about incidental project memories (UI preferences, past incidents, etc.) — so responses may be more generic than usual until it reads the current code.

## Active queue

| Session | File | Blocker |
| ------- | ---- | ------- |
| 19 | [session-19-marketing-recapture.md](session-19-marketing-recapture.md) | none — recaptures screenshots + refreshes `features.ts` + writes a real README for the marketing site |

## Shipped sessions

Sessions that have shipped are moved to `../archive/` for history. Their closure context lives in the per-session memos at `~/.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/project_*.md`.

To recall the original brief for a shipped session: read the file in `archive/` (the prompt is the spec) and the matching `project_*` memo (the closure note for what actually shipped, with file paths + commit refs).

| Session | Archived file | Closure memo |
| ------- | ------------- | ------------ |
| 4 | `archive/session-4-archive-schema.md` | `project_archive_lifecycle.md` |
| 5 | `archive/session-5-archive-gating.md` | `project_archive_lifecycle.md` |
| 6 | `archive/session-6-smoke-test.md` | (smoke report → handed back to user) |
| 7a | `archive/session-7a-c2-deferred.md` | `project_phase_c2_handoff.md` |
| 7b | `archive/session-7b-chat-sessions-cold-load.md` | (no repro after re-investigation; punted) |
| 7c | `archive/session-7c-ipv6-localhost.md` | `reference_dev_server_ipv6.md` |
| 7d | `archive/session-7d-contact-orgs-fk.md` | (deferred — not yet pursued) |
| 8 | `archive/session-8-tenant-perm-patch.md` | `project_messages_appointments_leak_close.md` |
| 9 | `archive/session-9-onboarding-completion.md` | (commit `ad886ec` "Updated registration flow") |
| 10 | `archive/session-10-empty-states-and-cleanup.md` | (rolled into onboarding ship) |
| 11 | `archive/session-11-final-verification.md` | (verification handed back to user) |
| 12 | `archive/session-12-marketing-screenshots-finish.md` | `project_marketing_people_dashboards.md` |
| 13 | `archive/session-13-marketing-screenshots-final.md` | `project_marketing_people_dashboards.md` |
| 14 | `archive/session-14-onboarding-and-cleanup.md` | (rolled into Session 9) |
| 15 | `archive/session-15-oauth-screen-recording.md` | (commit `00ff408`) |
| 17 | `archive/session-17-residual-leak-cleanup.md` | (residual hardening; closed in working tree) |
| 18 | `archive/session-18-document-system-finish.md` | `project_session18_document_system.md` |

(Sessions 1–3 predate this queue — Stripe + OAuth setup. Sessions 16 and others without their own files were planned and executed inline within the conversation that produced subsequent sessions.)

## How to use a session prompt on iPad

1. Open the session file in the GitHub web UI (or any markdown viewer).
2. Copy the whole file — each session is written to be self-contained.
3. Paste it into a fresh Claude conversation (claude.ai/code, a Codespace, wherever you're running Claude).
4. Claude will read the repo at the current HEAD and execute.
5. After the session ships, write a closure memo at `~/.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/project_<slug>.md`, then `git mv` the prompt to `../archive/` and add a row to the table above.

## Meta-notes for future Claude instances reading this

- Working directory: `/Users/peterhoffman/Sites/earnest/earnest` (if the Mac is hosting), or whatever the Codespace/remote mounts as. Resolve paths against the current repo root, not hard-coded `/Users/...`.
- Prod domains: `app.earnest.guru` (app), `admin.earnest.guru` (Directus), `earnest.guru` (marketing — separate repo at `~/Sites/earnest/earnest-marketing`).
- Do NOT hard-delete organizations through user flows — archive-first.
- Dev server: use `http://127.0.0.1:<port>`, never `localhost` (`reference_dev_server_ipv6.md`).
