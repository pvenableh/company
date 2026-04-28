/**
 * needs-org middleware — gates orgless non-client users to the org setup flow.
 *
 * If a logged-in user has no organization memberships AND isn't acting as a
 * client, they cannot use the dashboard surface. Redirect them to
 * `/organization/new` so they can create one.
 *
 * Whitelisted prefixes (must remain reachable for orgless users):
 *   /organization/new   — the setup destination itself
 *   /auth/*             — sign in / sign out / SSO callback
 *   /account            — profile editing while orgless is allowed
 *
 * When a redirect is triggered by an explicit user action (clicking a sidebar
 * link, manually visiting a URL), surface a toast so it's clear *why* they
 * landed back on the wizard. Suppressed for the natural post-login `/` hop —
 * that one's already self-evident.
 *
 * Pairs with `client-portal.global.ts` (handles clients) and `auth.ts`
 * (handles unauthed). All three coexist; do not collapse.
 */

// Maps top-level routes to display names for the redirect toast.
// Falls back to a Title-cased first-segment for routes not listed here.
const PATH_LABELS: Record<string, string> = {
  '/tickets': 'Tickets',
  '/projects': 'Projects',
  '/tasks': 'Tasks',
  '/scheduler': 'the Scheduler',
  '/files': 'Files',
  '/people': 'People',
  '/clients': 'Clients',
  '/leads': 'Leads',
  '/contacts': 'Contacts',
  '/channels': 'Channels',
  '/invoices': 'Invoices',
  '/proposals': 'Proposals',
  '/marketing': 'Marketing',
  '/financials': 'Financials',
  '/lists': 'Lists',
  '/email': 'Email',
  '/organization': 'Organization settings',
  '/organization/teams': 'Teams',
};

function labelFor(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  // Try first-segment exact match (e.g. /tickets/123 -> "Tickets")
  const firstSeg = `/${path.split('/')[1] ?? ''}`;
  if (PATH_LABELS[firstSeg]) return PATH_LABELS[firstSeg];
  // Fallback: title-case the first segment
  const seg = path.split('/')[1] ?? '';
  return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'this page';
}

export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();
  if (!loggedIn.value) return;

  const allowedPrefixes = ['/organization/new', '/auth', '/account'];
  if (allowedPrefixes.some((p) => to.path === p || to.path.startsWith(`${p}/`))) {
    return;
  }

  const { organizations, isInitialized, initializeOrganizations } = useOrganization();

  if (!isInitialized.value) {
    try {
      await initializeOrganizations();
    } catch {
      // If we can't fetch orgs, fall through — auth middleware or app shell will surface the error
      return;
    }
  }

  // Active membership in any org → continue (client-portal middleware will narrow further if needed)
  if (organizations.value.length > 0) return;

  // Orgless and not a client → onboarding gate
  const { isOrgClient } = useOrgRole();
  if (isOrgClient.value) return;

  // Suppress toast on the natural post-login root hop (`to.path === '/'`); the
  // wizard appearing right after sign-up speaks for itself.
  if (import.meta.client && to.path !== '/') {
    try {
      const { toast } = await import('vue-sonner');
      toast.info(`Register an organization to use ${labelFor(to.path)}.`);
    } catch {
      // toast lib unavailable — silent fallback is fine
    }
  }

  return navigateTo('/organization/new');
});
