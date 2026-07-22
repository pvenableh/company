// server/utils/org-stripe-customer.ts
// Org-owned billing: the ORGANIZATION — not any individual user — is the Stripe
// billing entity. The customer id lives on `organizations.stripe_customer_id`
// so every admin of the org sees the same plan, shares payment methods, and
// bills to one customer. New Stripe objects carry `metadata.organization_id`
// so the webhook can resolve the org directly (no customer→user→membership walk).
import { readItem, updateItem } from '@directus/sdk';

/**
 * Resolve (or create) the Stripe customer that owns an organization's billing.
 * Idempotent: reuses `organizations.stripe_customer_id` when set, otherwise
 * creates a customer tagged with the org id and persists it back.
 */
export async function getOrCreateOrgStripeCustomer(
	orgId: string,
	opts?: { emailFallback?: string; revalidate?: boolean },
): Promise<string> {
	const stripe = useStripe();
	const directus = getTypedDirectus();

	const org = (await directus.request(
		readItem('organizations', orgId, {
			fields: ['id', 'name', 'email', 'stripe_customer_id'],
		}),
	)) as any;

	if (!org) {
		throw createError({ statusCode: 404, message: 'Organization not found' });
	}
	if (org.stripe_customer_id) {
		// A stored id can be stale — e.g. it belongs to a different Stripe
		// account/key after the Earnest-platform migration, or the customer was
		// deleted. Callers that hand the id straight to Stripe (billing portal)
		// pass `revalidate` so a dead id self-heals instead of throwing a 400.
		if (!opts?.revalidate) return org.stripe_customer_id as string;
		try {
			const existing = await stripe.customers.retrieve(org.stripe_customer_id as string);
			if (existing && !(existing as any).deleted) return org.stripe_customer_id as string;
		} catch (err: any) {
			// `resource_missing` (No such customer) → fall through and re-create.
			if (err?.code !== 'resource_missing' && err?.statusCode !== 404) throw err;
		}
	}

	const customer = await stripe.customers.create({
		name: org.name || undefined,
		email: org.email || opts?.emailFallback || undefined,
		metadata: {
			organization_id: orgId,
			source: 'earnest_org_billing',
		},
	});

	await directus.request(
		updateItem('organizations', orgId, { stripe_customer_id: customer.id }),
	);

	return customer.id;
}

/** Read-only: the org's Stripe customer id, or null. Never creates. */
export async function getOrgStripeCustomerId(orgId: string): Promise<string | null> {
	const directus = getTypedDirectus();
	const org = (await directus.request(
		readItem('organizations', orgId, { fields: ['stripe_customer_id'] }),
	)) as any;
	return org?.stripe_customer_id || null;
}
