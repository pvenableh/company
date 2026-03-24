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
		aiTokens: {
			monthlyAllotment: 500_000,     // 500K tokens/month
			maxPerMember: 500_000,         // Solo = single user
			canPurchaseMore: true,
		},
	},
	team: {
		name: 'Team',
		stripePriceId: process.env.STRIPE_PRICE_TEAM || null,
		monthlyAmount: 8900, // $89.00
		features: { members: 10, storage_gb: 25, ai_credits: 'Unlimited' },
		aiTokens: {
			monthlyAllotment: 5_000_000,   // 5M tokens/month
			maxPerMember: 1_000_000,       // Default per-member cap
			canPurchaseMore: true,
		},
	},
	studio: {
		name: 'Studio',
		stripePriceId: process.env.STRIPE_PRICE_STUDIO || null,
		monthlyAmount: 18900, // $189.00
		features: { members: 25, storage_gb: 100, ai_credits: 'Unlimited' },
		aiTokens: {
			monthlyAllotment: 25_000_000,  // 25M tokens/month
			maxPerMember: 5_000_000,       // Default per-member cap
			canPurchaseMore: true,
		},
	},
} as const;

export type EarnestPlanId = keyof typeof EARNEST_PLANS;

// Token add-on packages available for purchase
export const TOKEN_PACKAGES = [
	{ id: 'tokens_500k', name: '500K Tokens', tokens: 500_000, priceInCents: 499, stripePriceId: process.env.STRIPE_PRICE_TOKENS_500K || null },
	{ id: 'tokens_2m', name: '2M Tokens', tokens: 2_000_000, priceInCents: 1499, stripePriceId: process.env.STRIPE_PRICE_TOKENS_2M || null },
	{ id: 'tokens_10m', name: '10M Tokens', tokens: 10_000_000, priceInCents: 4999, stripePriceId: process.env.STRIPE_PRICE_TOKENS_10M || null },
] as const;

export type TokenPackageId = typeof TOKEN_PACKAGES[number]['id'];

/** Resolve the plan ID from a Stripe price ID */
export function planFromPriceId(stripePriceId: string): EarnestPlanId | null {
	for (const [key, plan] of Object.entries(EARNEST_PLANS)) {
		if (plan.stripePriceId === stripePriceId) return key as EarnestPlanId;
	}
	return null;
}
