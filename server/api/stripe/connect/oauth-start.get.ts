// GET /api/stripe/connect/oauth-start?organizationId=...
//
// Standard Connect OAuth — lets an org link a PRE-EXISTING Stripe account
// (e.g. Hue's historical account) rather than creating a fresh one via the
// account-create + AccountLink flow in onboard.post.ts. Redirects the caller
// to Stripe's "connect / sign in" screen; Stripe returns to oauth-callback.
//
// Auth: caller must hold `org_settings:update` on the org and not be a demo
// session. The org id is carried in `state` and RE-verified on callback.
import { readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const orgId = getQuery(event).organizationId as string | undefined;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}

	// Where the callback should land the user afterwards. Defaults to the modern
	// Money > Deposits floor now that the classic org billing tab is retired;
	// `returnTo=org` is a legacy fallback (which itself redirects to Deposits).
	const returnTo = getQuery(event).returnTo === 'org' ? 'org' : 'money';

	await requireNotDemoSession(event);
	await requireActiveOrg(orgId);
	await requireOrgPermission(event, orgId, 'org_settings', 'update');

	const config = useRuntimeConfig();
	const clientId = config.stripeConnectClientId as string | undefined;
	if (!clientId) {
		throw createError({ statusCode: 500, message: 'Stripe Connect client id is not configured' });
	}

	const directus = getTypedDirectus();
	const org = (await directus
		.request(readItem('organizations', orgId, { fields: ['id', 'name', 'email', 'website'] }))
		.catch(() => null)) as { id: string; name?: string | null; email?: string | null; website?: string | null } | null;
	if (!org) {
		throw createError({ statusCode: 404, message: 'Organization not found' });
	}

	const baseUrl = getAppBaseUrl(event);
	const redirectUri = `${baseUrl}/api/stripe/connect/oauth-callback`;

	// `state` carries the org id (and the return target as `orgId|returnTo`); the
	// callback re-checks permission on the org, so a tampered state can only ever
	// target an org the signed-in user controls.
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		scope: 'read_write',
		redirect_uri: redirectUri,
		state: `${orgId}|${returnTo}`,
		'stripe_user[business_type]': 'company',
	});
	if (org.email) params.set('stripe_user[email]', org.email);
	if (org.website) params.set('stripe_user[url]', org.website);
	if (org.name) params.set('stripe_user[business_name]', org.name);

	return sendRedirect(event, `https://connect.stripe.com/oauth/authorize?${params.toString()}`);
});
