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
  const currentStaffRole = currentOrg?.membership?.role?.slug || null;
  const isPortalUserHere = !!currentOrg?.clientPortal;

  // Admin "preview as client" path — any /portal route with ?previewAs=<id>
  // is permitted for admin/owner users. The server-side scope endpoint
  // verifies the actual permission against client_portal_users + memberships.
  if (
    path.startsWith('/portal') &&
    typeof to.query?.previewAs === 'string' &&
    to.query.previewAs &&
    (currentStaffRole === 'admin' || currentStaffRole === 'owner')
  ) {
    return;
  }

  // Path 1: user IS a portal user in the currently-selected org.
  if (isPortalUserHere) {
    if (!isAllowed || path === '/') {
      return navigateTo('/portal');
    }
    return;
  }

  // Path 2: user has NO role and NO portal-row in the selected org. Could be
  // a stale cookie pointing at a former host org. If they're a portal user
  // anywhere else, switch them and redirect to /portal.
  if (!currentStaffRole) {
    const portalOrg = organizations.value.find((o: any) => !!o.clientPortal);
    if (portalOrg) {
      setOrganization(portalOrg.id);
      if (!path.startsWith('/portal')) {
        return navigateTo('/portal');
      }
    }
  }
});
