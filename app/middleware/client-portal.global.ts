// middleware/client-portal.ts
/**
 * Client Portal middleware — keeps client-role users in /portal.
 *
 * Behavior:
 *   - If the user's role in the currently-selected org is `client`,
 *     redirect non-portal routes to /portal.
 *   - If the user has NO role in the currently-selected org but DOES
 *     have a client membership elsewhere (stale cookie from a former
 *     org), switch them to that org and bounce to /portal.
 *   - Otherwise (member/manager/admin/owner of the selected org), no-op.
 *
 * This deliberately keys off `selectedOrg`, not "any client membership",
 * so a user who is a client in one org and an owner of another org can
 * use the org switcher to flip between portal-mode and full-app mode.
 */

export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();
  if (!loggedIn.value) return;

  const {
    initializeOrganizations,
    isInitialized,
    organizations,
    selectedOrg,
    setOrganization,
  } = useOrganization();

  if (!isInitialized.value) {
    try {
      await initializeOrganizations();
    } catch {
      return;
    }
  }

  const path = to.path;

  const allowedPrefixes = [
    '/portal',
    '/account',
    '/auth',
    '/approve',
    '/contracts/sign',
    '/contracts/preview',
    '/proposals/preview',
    '/invoices',
  ];
  const allowedExact = ['/'];
  const isAllowed =
    allowedExact.includes(path) ||
    allowedPrefixes.some((p) => path.startsWith(p));

  const currentOrg = organizations.value.find((o: any) => o.id === selectedOrg.value);
  const currentRole = currentOrg?.membership?.role?.slug || null;

  // Path 1: user IS a client in the currently-selected org.
  if (currentRole === 'client') {
    if (!isAllowed || path === '/') {
      return navigateTo('/portal');
    }
    return;
  }

  // Path 2: user has NO role in the selected org. Could be a stale cookie
  // pointing at a former host org. If they have a client membership somewhere,
  // switch them and redirect to /portal.
  if (!currentRole) {
    const clientOrg = organizations.value.find(
      (o: any) => o.membership?.role?.slug === 'client'
    );
    if (clientOrg) {
      setOrganization(clientOrg.id);
      if (!path.startsWith('/portal')) {
        return navigateTo('/portal');
      }
    }
  }
});
