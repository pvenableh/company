// middleware/client-portal.ts
/**
 * Client Portal middleware — redirects client-role users away from admin routes.
 *
 * Client users should only access /portal/* routes, /account, and /auth/* routes.
 * If a client user tries to access any other route, they're redirected to /portal.
 *
 * Usage: This is a global middleware that runs on every navigation.
 * Pages that are explicitly allowed for client users are whitelisted below.
 */

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession();

  // Skip entirely when not logged in — avoids triggering useOrgRole API calls
  if (!loggedIn.value) return;

  const { isOrgClient, hasMembership } = useOrgRole();

  // Only applies to logged-in client-role users with an active membership
  if (!hasMembership.value || !isOrgClient.value) {
    return;
  }

  const path = to.path;

  // Whitelist: routes client users CAN access
  const allowedPrefixes = [
    '/portal',         // Client portal pages
    '/account',        // User account settings
    '/auth',           // Auth pages (login, register, etc.)
  ];

  const allowedExact = [
    '/',               // Root (will redirect to /portal)
  ];

  // Check if route is allowed
  const isAllowed =
    allowedExact.includes(path) ||
    allowedPrefixes.some((prefix) => path.startsWith(prefix));

  if (!isAllowed) {
    // Redirect client users to portal dashboard
    return navigateTo('/portal');
  }

  // Redirect root to portal for client users
  if (path === '/') {
    return navigateTo('/portal');
  }
});
