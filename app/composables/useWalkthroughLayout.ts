/**
 * Detect which top-level shell the user is in so the walkthrough can show
 * shell-appropriate tours. Source of truth is the route path — every shell
 * has a unique prefix:
 *   /portal/*  → portal
 *   /apps/*    → apps
 *   anything else (signed-in staff) → classic
 *
 * This avoids reaching into `useAppsMode()` (which only flips when the user
 * toggles their layout pref) — what matters for tours is the route they
 * actually opened, not the preference they have stored.
 */
import type { LayoutKey } from '~/composables/useWalkthrough';

export function useWalkthroughLayout() {
  const route = useRoute();

  const currentLayout = computed<LayoutKey>(() => {
    const path = route.path;
    if (path === '/portal' || path.startsWith('/portal/')) return 'portal';
    if (path === '/apps' || path.startsWith('/apps/')) return 'apps';
    return 'classic';
  });

  return { currentLayout };
}
