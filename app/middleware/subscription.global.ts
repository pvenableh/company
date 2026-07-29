/**
 * subscription middleware — gates orgs whose subscription has lapsed (or that
 * never picked a plan) to the plan/upgrade flow.
 *
 * The public entry to Earnest is a 14-day, no-card free trial. When that trial
 * pauses at day 14 with no card — or a paid subscription is cancelled/unpaid —
 * the org's mirrored `subscription_status` (written by the Stripe webhook,
 * server/api/stripe/paymentchange.ts) moves into a LOCKED state and the app
 * locks to `/organization/upgrade`. An org that signed up but never chose a plan
 * (`subscription_status: 'incomplete'`) is routed to the plan picker
 * `/organization/new` instead.
 *
 * Deliberately conservative so it never mass-locks existing accounts:
 *   - `enterprise` orgs are internal/unlimited → never gated.
 *   - a NULL status (every org created before this shipped) → never gated.
 *   - `active` / `trialing` / `past_due` (card-retry grace) → allowed through.
 *
 * Pairs with `needs-org.global.ts` (orgless users) and `client-portal.global.ts`
 * (clients); all three coexist.
 */

// Lapsed states that lock the app to the upgrade screen. Kept in sync with the
// server-side LOCKED_SUBSCRIPTION_STATUSES in server/utils/ai-token-enforcement.ts.
const LOCKED_STATUSES = new Set(['incomplete_expired', 'paused', 'unpaid', 'canceled']);

export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();
  if (!loggedIn.value) return;

  // Reachable even while locked: the destinations themselves, auth, account,
  // the billing floor, portal (client surface), and signable client documents.
  const allowedPrefixes = [
    '/organization/new',
    '/organization/upgrade',
    '/auth',
    '/account',
    '/portal',
    '/contracts/sign',
    '/invoices',
  ];
  if (allowedPrefixes.some((p) => to.path === p || to.path.startsWith(`${p}/`))) return;

  const { currentOrg, isInitialized, initializeOrganizations } = useOrganization();
  if (!isInitialized.value) {
    try {
      await initializeOrganizations();
    } catch {
      // Can't resolve orgs — let needs-org / the app shell handle it.
      return;
    }
  }

  const org: any = currentOrg.value;
  // No selected org yet, or an enterprise (internal/unlimited) org → not our gate.
  if (!org || org.plan === 'enterprise') return;

  const status = org.subscription_status;

  // Clients never see the billing gate (they don't own the org's plan).
  const { isOrgClient } = useOrgRole();
  if (isOrgClient?.value) return;

  // Signed up but never chose a plan → the plan picker / trial start.
  if (status === 'incomplete') {
    return navigateTo('/organization/new');
  }

  // Trial paused / subscription lapsed → the add-a-card upgrade screen.
  if (LOCKED_STATUSES.has(status)) {
    return navigateTo('/organization/upgrade');
  }
});
