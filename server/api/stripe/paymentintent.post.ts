// POST /api/stripe/paymentintent
//
// Creates a Stripe PaymentIntent for an invoice payment. Phase 2 of Stripe
// Connect Express: when the merchant org has an active connected account,
// the intent is created on that account so funds settle directly to their
// bank — Earnest is never the merchant of record. Older orgs that haven't
// onboarded fall through to the platform Stripe path so existing invoices
// keep working.
//
// Routing matrix (resolved server-side from invoiceId → client → org):
//   org.stripe_account_status === 'active'    → connected account
//   org.stripe_account_status === 'pending'   → 412 (don't take money the
//   org.stripe_account_status === 'restricted'  org can't yet receive)
//   no stripe_account_id (status 'none')      → platform Stripe (legacy)
//
// The /payment.vue ad-hoc page also POSTs here without an invoiceId — that
// path stays on platform Stripe (it's a one-off "general payment" form).
import { readItem } from '@directus/sdk';
import Stripe from 'stripe';
import { useStripe } from '~~/server/utils/stripe';

const SUPPORTED_PAYMENT_TYPES = ['card', 'us_bank_account'] as const;
const MIN_AMOUNT = 50; // $0.50 — Stripe's minimum
const MAX_AMOUNT = 999_999_999;

interface PaymentIntentBody {
	amount?: number | string;
	email?: string;
	paymentType?: 'card' | 'us_bank_account';
	description?: string;
	invoiceId?: string;
	invoiceCode?: string;
	customer?: string;
	saveCard?: boolean;
}

const isValidEmail = (e?: string) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isValidAmount = (a: number | string | undefined) => {
	const n = typeof a === 'string' ? parseInt(a, 10) : a;
	return typeof n === 'number' && !isNaN(n) && n >= MIN_AMOUNT && n <= MAX_AMOUNT;
};

interface ConnectRouting {
	mode: 'connected' | 'platform';
	orgId: string | null;
	stripeAccount: string | null;
	applicationFeeAmount: number | null;
}

async function resolveRouting(invoiceId: string | undefined, amount: number, config: any): Promise<ConnectRouting> {
	// No invoiceId means this is a one-off /payment.vue intent — stay on
	// platform Stripe. Connect routing only applies to invoice payments.
	if (!invoiceId) {
		return { mode: 'platform', orgId: null, stripeAccount: null, applicationFeeAmount: null };
	}

	const directus = getTypedDirectus();
	const invoice = (await directus
		.request(
			readItem('invoices', invoiceId, {
				fields: [
					'id',
					'client.organization.id',
					'client.organization.stripe_account_id',
					'client.organization.stripe_account_status',
				],
			}),
		)
		.catch(() => null)) as
		| { id: string; client?: { organization?: { id: string; stripe_account_id?: string | null; stripe_account_status?: string | null } | null } | null }
		| null;

	const org = invoice?.client?.organization;
	if (!org) {
		// Invoice resolution failed — degrade to platform path. The legacy
		// behavior never required org context, so this keeps backward compat.
		return { mode: 'platform', orgId: null, stripeAccount: null, applicationFeeAmount: null };
	}

	const status = org.stripe_account_status || 'none';
	if (!org.stripe_account_id || status === 'none') {
		return { mode: 'platform', orgId: org.id, stripeAccount: null, applicationFeeAmount: null };
	}

	if (status !== 'active') {
		throw createError({
			statusCode: 412,
			message:
				'This organization is still finishing Stripe onboarding. Please ask them to complete activation, or pay via another method.',
		});
	}

	// Active connected account → optional platform fee.
	const bps = parseInt(String(config?.stripePlatformFeeBps || '0'), 10) || 0;
	const fee = bps > 0 ? Math.floor((amount * bps) / 10_000) : 0;

	return {
		mode: 'connected',
		orgId: org.id,
		stripeAccount: org.stripe_account_id,
		applicationFeeAmount: fee > 0 ? fee : null,
	};
}

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();
		const stripe = useStripe();
		const body = await readBody<PaymentIntentBody>(event);

		// ── Validate ────────────────────────────────────────────────────────────
		const errors: string[] = [];
		if (!isValidAmount(body.amount)) errors.push('Invalid amount specified');
		if (!isValidEmail(body.email)) errors.push('Invalid email address');
		if (body.paymentType && !SUPPORTED_PAYMENT_TYPES.includes(body.paymentType)) {
			errors.push('Unsupported payment type');
		}
		if (errors.length) {
			throw createError({ statusCode: 400, message: 'Validation failed', data: errors });
		}

		const amount = typeof body.amount === 'string' ? parseInt(body.amount, 10) : (body.amount as number);

		// ── Resolve Connect routing ─────────────────────────────────────────────
		const routing = await resolveRouting(body.invoiceId, amount, config);

		// ── Build PaymentIntent options ─────────────────────────────────────────
		const baseOptions: Stripe.PaymentIntentCreateParams = {
			amount,
			currency: 'usd',
			receipt_email: body.email,
			statement_descriptor: (config.public as any)?.companyName || 'Payment',
			metadata: {
				environment: process.env.NODE_ENV || 'development',
				created_at: new Date().toISOString(),
				invoice_id: body.invoiceId || '',
				invoice_code: body.invoiceCode || '',
				organization_id: routing.orgId || '',
				routing_mode: routing.mode,
			},
		};

		if (body.description) baseOptions.description = body.description;
		if (routing.applicationFeeAmount && routing.applicationFeeAmount > 0) {
			baseOptions.application_fee_amount = routing.applicationFeeAmount;
		}

		// Payment-method-type-specific options
		const paymentType = body.paymentType;
		const options: Stripe.PaymentIntentCreateParams =
			paymentType === 'card'
				? {
						...baseOptions,
						payment_method_types: ['card'],
						setup_future_usage: body.saveCard ? 'on_session' : undefined,
					}
				: paymentType === 'us_bank_account'
					? {
							...baseOptions,
							payment_method_types: ['us_bank_account'],
							payment_method_options: {
								us_bank_account: {
									financial_connections: { permissions: ['payment_method'] },
								},
							},
						}
					: {
							...baseOptions,
							automatic_payment_methods: { enabled: true },
						};

		if (body.customer) options.customer = body.customer;
		options.expand = ['latest_charge'];

		// ── Create — scoped to the connected account when applicable ───────────
		const requestOptions: Stripe.RequestOptions | undefined = routing.stripeAccount
			? { stripeAccount: routing.stripeAccount }
			: undefined;

		const paymentIntent = await stripe.paymentIntents.create(options, requestOptions);
		const latestCharge = paymentIntent.latest_charge as Stripe.Charge | null;

		return {
			clientSecret: paymentIntent.client_secret,
			id: paymentIntent.id,
			amount: paymentIntent.amount,
			latest_charge: latestCharge,
			// Returned so the client can pass `stripeAccount` to loadStripe.
			// Null = platform Stripe (no second-arg needed on loadStripe).
			stripeAccount: routing.stripeAccount,
			routingMode: routing.mode,
		};
	} catch (error: any) {
		// Re-throw H3/Stripe errors with their status preserved.
		if (error?.statusCode) throw error;

		if (error instanceof Stripe.errors.StripeError) {
			throw createError({
				statusCode: error.statusCode || 400,
				message: error.message,
				data: { code: error.code, type: error.type, param: error.param },
			});
		}

		console.error('Payment intent error:', error);
		throw createError({
			statusCode: 500,
			message:
				process.env.NODE_ENV === 'development'
					? `Payment intent creation failed: ${error?.message || 'unknown'}`
					: 'Payment intent creation failed',
		});
	}
});
