// server/utils/stripe.ts
// Shared Stripe instance factory for all server API endpoints
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function useStripe(): Stripe {
	if (_stripe) return _stripe;

	const config = useRuntimeConfig();
	const stripeSecretKey =
		process.env.NODE_ENV === 'production'
			? config.stripeSecretKeyLive
			: config.stripeSecretKeyTest;

	if (!stripeSecretKey) {
		throw new Error('Stripe secret key is not configured');
	}

	_stripe = new Stripe(stripeSecretKey, {
		apiVersion: '2024-10-28.acacia',
		maxNetworkRetries: 2,
	});

	return _stripe;
}

// Subscription plan definitions
export const EARNEST_PLANS = {
	free: {
		name: 'Earnest Free',
		stripePriceId: process.env.STRIPE_PRICE_FREE || null,
		features: { members: 1, storage_gb: 1, ai_credits: 10 },
	},
	pro: {
		name: 'Earnest Pro',
		stripePriceId: process.env.STRIPE_PRICE_PRO || null,
		monthlyAmount: 2900, // $29.00
		features: { members: 'Unlimited', storage_gb: 100, ai_credits: 'Unlimited' },
	},
	team: {
		name: 'Earnest Team',
		stripePriceId: process.env.STRIPE_PRICE_TEAM || null,
		monthlyAmount: 7900, // $79.00
		features: { members: 'Unlimited', storage_gb: 500, ai_credits: 'Unlimited' },
	},
} as const;

export type EarnestPlanId = keyof typeof EARNEST_PLANS;
