#!/usr/bin/env bash
#
# Branch Versioning Strategy
# ==========================
# Purpose: Make tailwind-4-shadcn-vue the new "main" (2.0) and archive old main as 1.0
#
# Run each section one at a time. Review output before proceeding to the next.
# You can run this script with: bash branch-versioning-strategy.sh
# Or copy/paste sections into your terminal.

set -euo pipefail

echo "============================================"
echo " Branch Versioning Strategy"
echo " tailwind-4-shadcn-vue → main (2.0)"
echo " old main → 1.0 archive"
echo "============================================"
echo ""

# --------------------------------------------------
# STEP 1: Create archive tags (safe, non-destructive)
# --------------------------------------------------
echo "▸ Step 1: Tagging old branches for archive..."

git fetch origin main tailwind-4-shadcn-vue

# Tag the old origin/main as v1.0
git tag -f v1.0-archive origin/main
echo "  ✓ Tagged origin/main as v1.0-archive"

# Tag the local master (which was at PR #35) — different from origin/main
git tag -f v1.0-master-archive master 2>/dev/null || echo "  (no local master branch — skipping)"
echo ""

# --------------------------------------------------
# STEP 2: Create a "1.0" archive branch from old main
# --------------------------------------------------
echo "▸ Step 2: Creating 1.0 archive branch..."

git branch -f 1.0 origin/main
git push -u origin 1.0
echo "  ✓ Pushed 1.0 branch (archive of old main)"
echo ""

# --------------------------------------------------
# STEP 3: Point "main" at tailwind-4-shadcn-vue
# --------------------------------------------------
echo "▸ Step 3: Updating main → tailwind-4-shadcn-vue..."

git checkout tailwind-4-shadcn-vue 2>/dev/null || git checkout -b tailwind-4-shadcn-vue origin/tailwind-4-shadcn-vue
git pull origin tailwind-4-shadcn-vue

# Force main to point at tailwind-4-shadcn-vue
git branch -f main HEAD
git push origin main --force-with-lease
echo "  ✓ main now points at tailwind-4-shadcn-vue (force-pushed)"
echo ""

# --------------------------------------------------
# STEP 4: Push archive tags
# --------------------------------------------------
echo "▸ Step 4: Pushing tags..."

git push origin v1.0-archive v1.0-master-archive 2>/dev/null || git push origin v1.0-archive
echo "  ✓ Tags pushed"
echo ""

# --------------------------------------------------
# STEP 5: Tag v2.0 on new main
# --------------------------------------------------
echo "▸ Step 5: Tagging new main as v2.0..."

git tag v2.0 main
git push origin v2.0
echo "  ✓ Tagged main as v2.0"
echo ""

# --------------------------------------------------
# STEP 6: Delete stale remote branches
# --------------------------------------------------
echo "▸ Step 6: Cleaning up stale branches..."
echo "  The following remote branches will be deleted:"

STALE_BRANCHES=(
  # Old feature/experiment branches
  "Directus-SDK-20"
  "dev"
  "directus-next"
  "directus-sdk"
  "directus-sdk-auth"
  "next-auth-wrapper"
  "nuxt-auth"
  "nuxt-auth-2"
  "nuxt-auth-3"
  "tailwindcss-4"
  # tailwind-4-shadcn-vue is now main — safe to remove
  "tailwind-4-shadcn-vue"
  # Merged claude/* branches
  "claude/add-field-component-iaqDs"
  "claude/add-tailwind-references-D6MsM"
  "claude/add-uavatar-wrapper-0RICh"
  "claude/fix-admin-login-401-8o5vI"
  "claude/fix-admin-social-buttons-Mr6bo"
  "claude/fix-dashboard-data-loading-XX1Rk"
  "claude/fix-directus-login-error-VJ3kO"
  "claude/fix-header-rendering-dywpo"
  "claude/fix-instant-meeting-error-BXyqq"
  "claude/fix-invoices-channels-loading-Ccvpm"
  "claude/fix-login-credentials-object-V63pD"
  "claude/fix-logo-see-all-W4PTX"
  "claude/fix-logo-team-management-C4AAF"
  "claude/fix-meetings-reorganize-pages-Y9Emp"
  "claude/fix-modal-auth-check-Cm59T"
  "claude/fix-org-selector-display-2n8WW"
  "claude/fix-participants-sidebar-yoCpP"
  "claude/fix-password-reset-url-1GQo2"
  "claude/fix-pnpm-engine-error-RrZSG"
  "claude/fix-session-config-error-HKx5w"
  "claude/fix-social-channels-bugs-41Ne1"
  "claude/fix-tailwind-nuxt-config-eINmk"
  "claude/fix-twilio-video-setup-OUIOw"
  "claude/fix-useenhancedauth-error-IFOWC"
  "claude/fix-video-container-camera-PtUco"
  "claude/fix-video-rendering-2Mfcd"
  "claude/fix-video-rendering-Sgcws"
  "claude/fullscreen-sharing-views-v2099"
  "claude/migrate-nuxt-auth-utils-8CK3o"
  "claude/migrate-nuxt4-shadcn-013fSRweB7xsbz7oX5aFdfbr"
  "claude/migrate-shadcn-vue-3n3Y7"
  "claude/migrate-tailwind-shadcn-mCwl2"
  "claude/projects-timeline-system-ybGtJ"
  "claude/replace-vcalendar-shadcn-tkaHg"
  "claude/update-avatar-component-HIOcw"
  "claude/upgrade-tailwind-css-4-4rBiK"
  "claude/video-fullscreen-views-8KEFX"
)

for branch in "${STALE_BRANCHES[@]}"; do
  echo "    - $branch"
done

echo ""
read -p "  Delete all of the above? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  for branch in "${STALE_BRANCHES[@]}"; do
    git push origin --delete "$branch" 2>/dev/null && echo "  ✓ Deleted $branch" || echo "  ✗ Failed to delete $branch (may already be gone)"
  done
else
  echo "  Skipped branch deletion."
fi

echo ""

# --------------------------------------------------
# STEP 7: Clean up local branches
# --------------------------------------------------
echo "▸ Step 7: Cleaning local tracking refs..."
git remote prune origin
git checkout main
echo ""

# --------------------------------------------------
# REMINDER: Update GitHub default branch
# --------------------------------------------------
echo "============================================"
echo " MANUAL STEP REQUIRED"
echo "============================================"
echo ""
echo " Go to: https://github.com/pvenableh/company/settings"
echo " → General → Default Branch → Change to 'main'"
echo ""
echo " This ensures PRs target 'main' and clones"
echo " check out the right branch by default."
echo ""
echo "============================================"
echo " Done! Summary:"
echo "   • 1.0 branch = archived old main"
echo "   • main branch = former tailwind-4-shadcn-vue (2.0)"
echo "   • v1.0-archive tag = old main snapshot"
echo "   • v2.0 tag = new main snapshot"
echo "============================================"
