/**
 * Detect which route family the user is in so the walkthrough can show
 * route-appropriate tours. Source of truth is the route path:
 *   /portal/*  → portal
 *   /apps/*    → apps
 *   anything else (signed-in staff on a legacy, non-/apps route) → classic
 *
 * NOTE: since the classic *layout* was removed, every staff route renders in
 * the apps shell. The `'classic'` key is now a misnomer — it no longer means
 * "classic layout," it distinguishes the legacy staff routes (/projects/[id],
 * /invoices, …) from the first-class `/apps/*` routes so tours can target one
 * surface or the other. Kept as-is because 8 tours in `walkthrough-tours.ts`
 * are still tagged `layouts: ['classic']`; renaming it means retagging them.
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
