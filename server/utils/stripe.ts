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

// Subscription plan definitions — must match SellSheet pricing
export const EARNEST_PLANS = {
	solo: {
		name: 'Solo',
		stripePriceId: process.env.STRIPE_PRICE_SOLO || null,
		monthlyAmount: 2900, // $29.00
		features: { members: 1, storage_gb: 5, ai_credits: 'Limited' },
	},
	team: {
		name: 'Team',
		stripePriceId: process.env.STRIPE_PRICE_TEAM || null,
		monthlyAmount: 8900, // $89.00
		features: { members: 10, storage_gb: 25, ai_credits: 'Unlimited' },
	},
	studio: {
		name: 'Studio',
		stripePriceId: process.env.STRIPE_PRICE_STUDIO || null,
		monthlyAmount: 18900, // $189.00
		features: { members: 25, storage_gb: 100, ai_credits: 'Unlimited' },
	},
} as const;

export type EarnestPlanId = keyof typeof EARNEST_PLANS;
