# Releasing & versioning

Earnest's version number is **auto-counted from git** — you almost never touch it by hand. This doc explains the model and the one manual action you do have: tagging.

## How the version number works

The version shown in-app (avatar menu + Account → About) is `MAJOR.MINOR.PATCH`, built from git at build time ([`nuxt.config.ts`](../nuxt.config.ts) → `resolveAppVersion()`):

```
   v2.0   tag (manual)  ─┐
                         ├──►   2.0.687
   687 commits since it ─┘        │   │
                                  │   └── PATCH = commits since the tag  (automatic)
                                  └────── MAJOR.MINOR = the tag           (manual)
```

- **PATCH (third number)** climbs by itself on **every push that deploys** — `2.0.687 → 2.0.688 → …`. No action needed.
- **MAJOR.MINOR** is the most recent `vX.Y` tag. Tagging is the **only** manual lever.

So a normal day of pushing just makes the third number tick up. When you want to mark a new feature line or era, you create a tag.

> Why two of these things exist: the per-deploy **freshness check** (the "Update available — refresh" toast) keys off the commit SHA, not this number. This version number is the human-readable label. See [`memory` / deploy-update-checker] for the full plumbing.

## Cutting a release (bumping MAJOR or MINOR)

Tagging does two things automatically: it sets the new `MAJOR.MINOR` base, and (once pushed) it creates a GitHub Release with auto-generated notes via [`.github/workflows/release.yml`](../.github/workflows/release.yml).

### Option A — npm scripts (recommended)

```bash
npm run release:minor      # latest tag v2.0 → creates v2.1   (new feature line)
npm run release:major      # latest tag v2.3 → creates v3.0   (breaking / new era)

# then push the tag — THIS is what ships it + files the GitHub Release:
git push origin v2.1
```

Preview without creating anything:

```bash
node scripts/bump-version.mjs minor --dry-run
node scripts/bump-version.mjs v2.5          # explicit tag instead of auto-increment
```

The script creates the annotated tag on your current commit but **does not push** — it prints the exact `git push` command so you stay in control of when it goes live.

### Option B — tag by hand in VS Code

1. `Cmd+Shift+P` → **`Git: Create Tag`** → name it `v2.1`, message `v2.1`
2. `Cmd+Shift+P` → **`Git: Push Tags`**

> ⚠️ VS Code's normal **Sync / Push does _not_ send tags** — you must run **Push Tags** (or the terminal `git push origin v2.1`) or the release won't trigger.

### Option C — terminal

```bash
git tag -a v2.1 -m "v2.1"
git push origin v2.1
```

## What happens after you push a tag

1. The next Vercel build bakes the new base in → app shows `2.1.0`, then `2.1.1`, `2.1.2`… as you keep pushing.
2. [`release.yml`](../.github/workflows/release.yml) fires on the tag push and creates a **GitHub Release** named `v2.1` with notes auto-generated from the commits since the previous tag.

## Rules of thumb

| You want… | Do this |
|---|---|
| Ship code, don't care about the number | just push — patch auto-increments |
| Mark a new feature line | `npm run release:minor` + push the tag |
| Mark a breaking change / new era | `npm run release:major` + push the tag |
| A specific number | `node scripts/bump-version.mjs v2.5` + push the tag |

## Notes

- Tag format is **`vMAJOR.MINOR`** (e.g. `v2.1`, `v3.0`) — two parts, no patch. The patch is always the auto-counted commit total. The legacy `v2.0` / `v1.0-archive` tags predate this scheme.
- `package.json`'s `version` (`2.0.0`) is only a **fallback** used if git/tags aren't reachable at build time (e.g. a shallow clone). The `prebuild` script unshallows + fetches tags on Vercel so the real count is used.
- This replaced the old **release-please** flow (rolling Release PR + `CHANGELOG.md`), which was removed on 2026-06-25 because the Release PR was never merged, so the displayed version never changed.
