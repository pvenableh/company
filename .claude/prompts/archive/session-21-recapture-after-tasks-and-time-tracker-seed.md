# Session 21 — Re-seed + recapture after Quick Tasks + Time Tracker demo data

**Status:** Ready
**Repo (app):** `~/Sites/earnest/earnest`
**Repo (marketing — sibling):** `~/Sites/earnest/earnest-marketing`
**Ships:** Refreshed solo-demo screenshots for the 5 surfaces below, plus 2 new shots wired into the capture pipeline (`/tasks`, `/time-tracker`).

## Why

The previous session updated the solo demo seed (`scripts/setup-demo-org.ts` + `scripts/lib/demo-seed.ts`) to add:
- 3 status-mixed projects (`Helios West Hotel Launch` In-Progress, `Meridian Site Refresh` Completed, `Driftwood Roasters Rebrand` Scheduled) plus 14 project_events with mixed types (Design / Content / Timeline / Hours / Financial) and statuses → so the Project Timeline gantt on `/command-center` shows the full Clean-Gantt color palette + opacity variation.
- 4 color-coded `services` rows (global collection — no `organization` FK) so projects render with non-gray summary bars.
- 13 `time_entries` for the demo user spread across the current week, one in `running` status (for the active-timer state on `/time-tracker`).
- 13 `tasks` (4 Today / 4 This Week / 3 Later / 2 Completed) with mixed priorities, statuses, due dates, and `assigned_to` the demo user.
- `seedTodayAppointments` switched from `findOrCreate` (frozen dates) to PATCH-on-existing (shifts to today on every re-run) and shifted to **EDT** wall-clock hours: 9:00am / 11:30am / 2:00pm / 4:00pm.

That data only takes effect after re-running the seed against prod Directus. Then the screenshots need to be re-captured — and 2 new shots (`tasks`, `time-tracker`) need to be added to the capture script.

## Pre-flight

The seed writes to **prod** Directus (`admin.earnest.guru`) by default — both demo orgs live there. Confirm `.env` has:

```
DIRECTUS_URL=https://admin.earnest.guru        # or http://localhost:8055 if running local
DIRECTUS_SERVER_TOKEN=<admin token>            # OR DIRECTUS_ADMIN_TOKEN
DEMO_USER_PASSWORD=<solo demo password>
DEMO_AGENCY_USER_PASSWORD=<agency demo password>   # optional — agency shots skip if absent
APP_URL=http://127.0.0.1:3000                   # capture script reads this — NOT localhost (IPv6 426)
```

Use `127.0.0.1`, not `localhost` — see `reference_dev_server_ipv6.md` for why.

## Track 1 — Re-seed the solo demo

```bash
cd ~/Sites/earnest/earnest
pnpm tsx scripts/setup-demo-org.ts
```

Expected console output (look for these lines specifically — they confirm the new helpers fired):

- `--- services (color palette for Project Timeline) ---` → 4 service rows
- `--- projects + events (mixed status for Clean Gantt) ---` → `[ok]   3 projects + 14 events`
- `--- quick tasks ---` → 13 task rows
- `--- time entries (this week + running timer) ---` → `[ok]   11 time entries (this-week)`
- `--- today's appointments ---` → `[shift] appointment "..." → today` (4 lines, on re-run; on first run they're `[ok]`)

**Idempotent.** Re-running is safe: projects + events PATCH instead of duplicating; `seedTodayAppointments` PATCHes start_time/end_time forward; `seedTimeEntries` PATCHes day-relative timestamps.

(Agency demo doesn't need re-seeding for this session — the new helpers aren't wired into `setup-demo-agency-org.ts`. The 5 shots in scope are all solo persona.)

## Track 2 — Add `tasks` + `time-tracker` shots to the capture script

Edit `scripts/capture-demo-screenshots.ts`. Find the `SHOTS: Shot[]` array (~line 125) and add two new entries inside the **Solo (Member role)** block, alongside the existing `scheduler-day` shot:

```ts
{
    slug: 'quick-tasks',
    viewport: 'inline',
    persona: 'solo',
    resolveUrl: async ({ baseUrl }) => `${baseUrl}/tasks`,
},
{
    slug: 'time-tracker',
    viewport: 'inline',
    persona: 'solo',
    resolveUrl: async ({ baseUrl }) => `${baseUrl}/time-tracker`,
    // The page defaults to "This Week" tab — give the entries a beat to
    // hydrate before the shutter fires (the realtime subscription on
    // time_entries can lag).
    waitFor: async (page) => {
        await page.waitForTimeout(1500);
    },
},
```

Decisions to make + defend in the response:
1. Naming: `quick-tasks` vs `tasks` — pick whichever matches how the marketing repo references it. Grep `~/Sites/earnest/earnest-marketing/src` (or `pages` / `data`) for existing `<slug>.png` references and either match the existing slug or update the marketing site to point at the new one. Same call for `time-tracker`.
2. Viewport: default to `inline` (1280×720@2x). If the time-tracker week table or the tasks 4-column layout get cut off, bump to `hero` (1440×900@2x).

## Track 3 — Capture the 5 shots

```bash
# In one terminal — keep the dev server running.
cd ~/Sites/earnest/earnest
pnpm dev --host 0.0.0.0
```

Wait for "Local: http://127.0.0.1:3000". Then in a second terminal:

```bash
cd ~/Sites/earnest/earnest
APP_URL=http://127.0.0.1:3000 pnpm tsx scripts/capture-demo-screenshots.ts
```

The capture script writes to BOTH:
- `~/Sites/earnest/earnest-marketing/public/screenshots/2026-05/<slug>.png` (dated archive)
- `~/Sites/earnest/earnest-marketing/public/screenshots/latest/<slug>.png` (what the marketing site reads from)

The 5 shots in scope:

| Slug | Surface | What to verify |
| ---- | ------- | -------------- |
| `command-center` | `/command-center` (hero, 1440×900@2x) | Project Timeline widget shows ≥ 3 lanes with mixed bar colors (pink Brand & Identity, cyan Web & Digital). At least one lane is faded (Completed → opacity 0.3) and at least one is full-opacity (Active). NOT a flat row of gray bars. |
| `project-timeline` | `/projects/<first id>` (inline) | Detail-view gantt for Helios — should show 5 events spanning Discovery (faded) → Brand v1 (faded) → Launch content (full opacity) → Phase 1 invoice (faded) → Opening ceremony milestone (diamond). |
| `scheduler-day` | `/scheduler` (inline) | Day Timeline lane on the right shows 4 appointments anchored to **today** at 9:00am / 11:30am / 2:00pm / 4:00pm EDT. NOT empty. |
| `quick-tasks` | `/tasks` (inline) | Stats row shows ≥ 9 active + ≥ 2 completed. The list groups by schedule with "Today" + "This Week" + "Later" sections all populated. Mix of priority badges visible. |
| `time-tracker` | `/time-tracker` (inline) | "This Week" tab is active by default. ≥ 5 entries visible across the past few days. The today-running entry shows as live (no end time, "running" badge). Project chips show Helios + Meridian + Driftwood. |

If any shot is empty or wrong: read the page in a browser at the corresponding URL signed in as `demo@earnest.guru` first, diagnose, fix in the seed or page code, re-run the seed, re-capture.

## Track 4 — Verify in the browser preview before committing

Run the dev server (`pnpm dev`), sign in as the solo demo (`/try-demo` → "Solo studio") and click through:

1. `/command-center` — Project Timeline widget. Confirm the 3 project lanes + mixed-color event bars + opacity variation by status.
2. `/projects` — list shows 3 projects with status chips (In Progress / Completed / Scheduled). Click into Helios — gantt has 5 events.
3. `/tasks` — 4 sections populated, mix of priorities, "Assigned to Me" tab non-empty.
4. `/time-tracker` — "This Week" tab default, running entry visible, ≥ 5 completed entries spread across days.
5. `/scheduler` — Day Timeline shows 4 appointments at the EDT wall-clock times above.

If anything is empty after a successful seed: check `seedTimeEntries` realtime subscription delay, or whether `assigned_to` M2M (`tasks_directus_users`) actually wired up (the seed inserts the junction row directly).

## Track 5 — Commit + close out

After the 5 shots look right:

```bash
cd ~/Sites/earnest/earnest
git add scripts/lib/demo-seed.ts scripts/setup-demo-org.ts scripts/capture-demo-screenshots.ts
git commit -m "Demo seed: add Quick Tasks + Time Tracker, mixed-status projects, EDT appointments"

cd ~/Sites/earnest/earnest-marketing
git add public/screenshots/
git commit -m "Recapture solo-demo screenshots (Track 21): command-center color palette, scheduler EDT, new tasks + time-tracker shots"
```

Then write a closure memo at `~/.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/project_session21_demo_recapture.md` covering: which shots changed, what new fixtures the seed now produces, EDT wall-clock decision, and whether the marketing site already references `quick-tasks` / `time-tracker` slugs (Track 2 decision #1).

Add a row to `.claude/prompts/launch-queue/README.md`'s "Shipped sessions" table and `git mv` this prompt to `../archive/`.

## Known gotchas

- **Floating dock hidden in shots.** `HIDE_OVERLAYS_CSS` in the capture script hides `.floating-dock` so the timer-dock active-session pill won't show on the `command-center` shot. The running timer is only visible inside `/time-tracker` itself (in the entry list) — that's by design for the inline shots.
- **`tasks_directus_users` junction.** `seedQuickTasks` writes to that junction directly. If the demo user isn't seeing tasks under "Assigned to Me", check that the seed inserted the junction row (look for `[ok]   task assignee (...)` lines in seed output).
- **Time-tracker "This Week" boundary.** The page filters `start_time` between `startOfWeek(Mon)` and `endOfWeek(Sun)`. `seedTimeEntries` uses `dayOffset` -5 → 0; if the seed runs on a Monday morning the -5 entries fall on the prior week. Acceptable for screenshots — Tuesday-onward runs cover the whole bar.
- **EDT vs EST.** May–November is EDT (UTC-4); the seed hard-codes `+4` from EDT wall-clock to UTC. In winter (Nov–Mar) the displayed times will be 1 hour earlier than the comments suggest. Re-capture in winter? Bump `+4` to `+5` in `seedTodayAppointments` and `seedTimeEntries`.
- **Cache.** If `/command-center` still looks gray after re-seed, hard-reload (`Cmd+Shift+R`) to flush the SSR-cached page render.
