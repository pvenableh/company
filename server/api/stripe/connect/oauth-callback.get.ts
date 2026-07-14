// GET /api/stripe/connect/oauth-callback?code=...&state=<orgId>
//
// Return leg of the Standard Connect OAuth flow started in oauth-start. Stripe
// redirects here with an authorization `code`; we exchange it for the
// connected account's id (`stripe_user_id`) and store it on the org. Because
// this is a top-level browser redirect the caller's session cookie is present,
// so we RE-verify org permission before trusting `state`.
import { updateItem } from '@directus/sdk';
import Stripe from 'stripe';

function backToBilling(event: any, query: Record<string, string>) {
	const baseUrl = process.env.APP_URL || 'http://127.0.0.1:3000';
	const qs = new URLSearchParams({ tab: 'billing', ...query }).toString();
	return sendRedirect(event, `${baseUrl}/organization?${qs}`);
}

export default defineEventHandler(async (event) => {
	const q = getQuery(event);
	const orgId = q.state as string | undefined;

	// User declined on Stripe's screen, or Stripe returned an error.
	if (q.error) {
		return backToBilling(event, { connect_error: String(q.error_description || q.error) });
	}
	const code = q.code as string | undefined;
	if (!code || !orgId) {
		throw createError({ statusCode: 400, message: 'Missing code or state' });
	}

	// Re-verify: only someone who can manage THIS org may bind an account to it.
	await requireNotDemoSession(event);
	await requireActiveOrg(orgId);
	await requireOrgPermission(event, orgId, 'org_settings', 'update');

	const stripe = useStripe();

	let connectedAccountId: string;
	try {
		const token = await stripe.oauth.token({ grant_type: 'authorization_code', code });
		connectedAccountId = token.stripe_user_id as string;
	} catch (err: any) {
		console.error('[connect/oauth-callback] token exchange failed:', err?.message || err);
		return backToBilling(event, { connect_error: 'Could not link the Stripe account. Please try again.' });
	}

	if (!connectedAccountId) {
		return backToBilling(event, { connect_error: 'Stripe did not return an account id.' });
	}

	// Reflect live capability state so the routing matrix treats it correctly.
	let status: 'pending' | 'active' | 'restricted' = 'pending';
	let country = 'US';
	try {
		const account = await stripe.accounts.retrieve(connectedAccountId);
		country = (account.country || 'US').toUpperCase();
		status = account.charges_enabled ? 'active' : account.requirements?.disabled_reason ? 'restricted' : 'pending';
	} catch (err: any) {
		console.warn('[connect/oauth-callback] account retrieve failed (defaulting to pending):', err?.message || err);
	}

	const directus = getTypedDirectus();
	await directus.request(
		updateItem('organizations', orgId, {
			stripe_account_id: connectedAccountId,
			stripe_account_status: status,
			stripe_account_country: country,
		}),
	);

	console.log(`[connect/oauth-callback] linked ${connectedAccountId} (${status}) to org ${orgId}`);

	return backToBilling(event, { connect_linked: '1', onboarding: 'complete' });
});
