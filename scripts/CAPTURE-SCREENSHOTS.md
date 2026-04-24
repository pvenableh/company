# capture-demo-screenshots

Drives a headless Chromium through the public demo workspaces (solo + agency)
and writes product screenshots into the `earnest-marketing` repo's
`public/screenshots/` folder. The marketing site's feature pages and hero read
from those files.

## Run

```sh
# From the earnest app repo root.
DEMO_USER_PASSWORD=<from .env or Vercel> \
DEMO_AGENCY_USER_PASSWORD=<from .env or Vercel> \
APP_URL=http://localhost:3000 \
pnpm tsx scripts/capture-demo-screenshots.ts
```

First run on a new machine:

```sh
pnpm exec playwright install chromium
```

`DEMO_AGENCY_USER_PASSWORD` is **optional** — when absent, Admin-role shots
(`/organization/*`, `/teams/*`, full `/marketing`) are skipped and the script
still captures the Member-role set cleanly.

## Output

Every run writes PNGs to **both**:

```
earnest-marketing/public/screenshots/<YYYY-MM>/<slug>.png   # dated history
earnest-marketing/public/screenshots/latest/<slug>.png      # what the site reads
```

The `latest/` mirror is the one referenced by `getScreenshotSrc()` in
`app/data/features.ts` and by the SellSheetModern hero — so the site always
shows the newest capture without editing any paths.

The dated folder is cleared & rewritten on each run within that month, so
re-running the script doesn't accumulate duplicates within a month but
preserves prior months for comparison.

## Env vars

| Var                         | Required | Default                  | Notes                                                                  |
|-----------------------------|----------|--------------------------|------------------------------------------------------------------------|
| `DEMO_USER_PASSWORD`        | yes      | —                        | Solo demo (Member role). See `project_demo_mode.md`.                   |
| `DEMO_AGENCY_USER_PASSWORD` | no       | —                        | Agency demo (Admin role). If unset, Admin-only shots are skipped.      |
| `APP_URL`                   | no       | `http://localhost:3000`  | Set to `https://app.earnest.guru` to capture against prod demo.        |

## When to re-capture

- **Monthly** — marketing refresh cadence. Just re-run the command.
- **When UI changes land** on any captured screen: `/command-center`,
  `/leads`, `/contacts/*`, `/clients/*`, `/projects/*`, `/tickets`,
  `/financials`, `/marketing`, `/organization`, `/organization/teams`,
  `/teams/*`.
- After re-seeding either demo org (`pnpm tsx scripts/setup-demo-org.ts` or
  `pnpm tsx scripts/setup-demo-agency-org.ts`).

## What's captured

Matched to feature pages in the marketing site. Persona column indicates
which login the shot is captured under.

### Solo (Member role)

| Slug                     | URL                            | Viewport     |
|--------------------------|--------------------------------|--------------|
| `command-center`         | `/command-center`              | 1440×900 @2x |
| `leads-pipeline`         | `/leads`                       | 1280×720 @2x |
| `contact-detail`         | `/contacts/<first-seeded-id>`  | 1280×720 @2x |
| `client-detail`          | `/clients/<first-seeded-id>`   | 1280×720 @2x |
| `project-timeline`       | `/projects/<first-seeded-id>`  | 1280×720 @2x |
| `tickets-kanban`         | `/tickets`                     | 1280×720 @2x |
| `financials-overview`    | `/financials`                  | 1280×720 @2x |

### Agency (Admin role) — requires `DEMO_AGENCY_USER_PASSWORD`

| Slug                     | URL                            | Viewport     |
|--------------------------|--------------------------------|--------------|
| `marketing-overview`     | `/marketing`                   | 1280×720 @2x |
| `organization-overview`  | `/organization`                | 1280×720 @2x |
| `organization-teams`     | `/organization/teams`          | 1280×720 @2x |
| `team-detail`            | `/teams/<first-seeded-id>`     | 1280×720 @2x |

Detail-page IDs are resolved at run-time by scraping the first
`<a href="/contacts/…">` (etc.) in the list view — no hardcoded UUIDs.

## Overlays hidden during capture

The script injects a stylesheet on every page that hides:

- `.floating-dock` / `.dock-morph` / `.dock-edge-trigger` — the desktop AI
  launcher dock, so it doesn't cover the content.
- `[data-testid="ai-tray"]` — the contextual AI sidebar if it happens to
  be open.

If new overlays get added that don't belong in marketing shots, extend
`HIDE_OVERLAYS_CSS` in `capture-demo-screenshots.ts`.

## Adding a new capture

1. Add a `DemoShot` union member in
   `<earnest-marketing>/app/data/features.ts`.
2. Push a new `Shot` object into the `SHOTS` array in this script. Pick
   `persona: 'solo'` unless the page is Admin-only.
3. (Optional) point a feature mapping at the new shot in
   `FEATURE_DEMO_MAP`. If the redirect target is Admin-only, set
   `persona: 'agency'` on that mapping so the "Try this live" CTA
   pre-selects the agency login.
4. Run the script. The new PNG lands in `latest/` alongside the rest.

## Troubleshooting

- **`solo demo-login failed: 401`** — `DEMO_USER_PASSWORD` is wrong. Check
  `.env` or Vercel env.
- **`agency demo-login failed: 503`** — agency endpoint reports "not
  configured". The `DEMO_AGENCY_USER_PASSWORD` on the server side is missing.
- **`agency demo-login failed: 401`** — `DEMO_AGENCY_USER_PASSWORD` on the
  client and server don't match. Re-run `setup-demo-agency-org.ts` with the
  desired value and sync env.
- **`No seeded detail rows found under /contacts`** — demo org was wiped
  or the seed script hasn't run. Run the matching
  `scripts/setup-demo-*-org.ts`.
- **Screenshot shows a loading spinner** — bump `SETTLE_MS` or add a
  shot-specific `waitFor` (e.g. wait for a data element) in `SHOTS`.
- **Overlay peeks through on one page** — its selector isn't in
  `HIDE_OVERLAYS_CSS`; add it and re-run.
