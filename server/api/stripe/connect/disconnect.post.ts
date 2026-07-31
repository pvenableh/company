// POST /api/stripe/connect/disconnect
// Disconnect the org's connected Stripe (Connect) account so a different account
// can be linked. Clears the org's stripe_account_* reference; for OAuth-linked
// accounts it also revokes the platform connection (best-effort).
//
// This unblocks the "switch account" case: an org stuck on a pending OAuth-linked
// account (which can't be onboarded via account links) can disconnect and start
// fresh with "Set up payments" or "Link an existing account".
import { readItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ organizationId: string }>(event);
  const orgId = body?.organizationId;
  if (!orgId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  // Org-owned billing — owner/admin of THIS org only; never demo sessions.
  await requireNotDemoSession(event);
  await requireOrgPermission(event, orgId, 'org_settings', 'update');

  const stripe = useStripe();
  const directus = getServerDirectus();
  const config = useRuntimeConfig() as any;

  const org = (await directus
    .request(readItem('organizations', orgId, { fields: ['stripe_account_id'] }))
    .catch(() => null)) as any;
  const accountId = org?.stripe_account_id;

  // Best-effort revoke for OAuth-linked accounts. Platform-created Standard
  // accounts aren't OAuth-connected, so deauthorize errors there — ignore it;
  // clearing the org reference is what actually enables switching.
  if (accountId && config.stripeConnectClientId) {
    await stripe.oauth
      .deauthorize({ client_id: config.stripeConnectClientId, stripe_user_id: accountId })
      .catch((e: any) => console.warn('[connect/disconnect] deauthorize (non-fatal):', e?.message));
  }

  await directus.request(
    updateItem('organizations', orgId, {
      stripe_account_id: null,
      stripe_account_status: 'none',
      stripe_account_country: null,
    }),
  );

  return { ok: true };
});
