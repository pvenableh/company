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

// Subscription plan definitions — must match business model v3 pricing
// All plans get all features. Differentiation is seats, tokens, and scans.
// White-label is the one exception (agency only).
export const EARNEST_PLANS = {
	solo: {
		name: 'Solo',
		stripePriceId: process.env.STRIPE_PRICE_SOLO || null,
		stripePriceIdAnnual: process.env.STRIPE_PRICE_SOLO_ANNUAL || null,
		monthlyAmount: 4900,  // $49.00
		annualAmount: 40800,  // $408.00/yr (2 months free)
		seats: 1,
		clientPortalSeats: 5,
		scanCredits: 25,
		whiteLabel: false,
		aiTokens: {
			monthlyAllotment: 100_000,     // 100K tokens/month
			maxPerMember: 100_000,         // Solo = single user
			canPurchaseMore: true,
		},
	},
	studio: {
		name: 'Studio',
		stripePriceId: process.env.STRIPE_PRICE_STUDIO || null,
		stripePriceIdAnnual: process.env.STRIPE_PRICE_STUDIO_ANNUAL || null,
		monthlyAmount: 14900, // $149.00
		annualAmount: 124100, // $1,241.00/yr (2 months free)
		seats: 8,
		clientPortalSeats: 15,
		scanCredits: 150,
		whiteLabel: false,
		aiTokens: {
			monthlyAllotment: 400_000,     // 400K tokens/month
			maxPerMember: 50_000,          // Default per-member cap
			canPurchaseMore: true,
		},
	},
	agency: {
		name: 'Agency',
		stripePriceId: process.env.STRIPE_PRICE_AGENCY || null,
		stripePriceIdAnnual: process.env.STRIPE_PRICE_AGENCY_ANNUAL || null,
		monthlyAmount: 29900, // $299.00
		annualAmount: 249100, // $2,491.00/yr (2 months free)
		seats: 15,
		clientPortalSeats: -1, // unlimited — growth loop for token consumption
		scanCredits: 500,      // generous cap; heavy scanners buy SCAN_PACKAGES
		whiteLabel: false,     // $19/mo add-on via hasAddon('white_label')
		aiTokens: {
			monthlyAllotment: 1_000_000,   // 1M tokens/month
			maxPerMember: 100_000,         // Default per-member cap
			canPurchaseMore: true,
		},
	},
} as const;

export type EarnestPlanId = keyof typeof EARNEST_PLANS;

// Token add-on packages available for purchase
export const TOKEN_PACKAGES = [
	{ id: 'tokens_100k', name: '100K Tokens', tokens: 100_000, priceInCents: 900, stripePriceId: process.env.STRIPE_PRICE_TOKENS_100K || null },
	{ id: 'tokens_500k', name: '500K Tokens', tokens: 500_000, priceInCents: 3900, stripePriceId: process.env.STRIPE_PRICE_TOKENS_500K || null },
	{ id: 'tokens_1_5m', name: '1.5M Tokens', tokens: 1_500_000, priceInCents: 9900, stripePriceId: process.env.STRIPE_PRICE_TOKENS_1_5M || null },
] as const;

export type TokenPackageId = typeof TOKEN_PACKAGES[number]['id'];

// Scan credit packages available for purchase
export const SCAN_PACKAGES = [
	{ id: 'scans_100', name: '100 Scans', scans: 100, priceInCents: 1200, stripePriceId: process.env.STRIPE_PRICE_SCANS_100 || null },
	{ id: 'scans_500', name: '500 Scans', scans: 500, priceInCents: 4900, stripePriceId: process.env.STRIPE_PRICE_SCANS_500 || null },
] as const;

export type ScanPackageId = typeof SCAN_PACKAGES[number]['id'];

// Recurring add-on definitions — billed monthly alongside the base subscription
export const EARNEST_ADDONS = {
	extra_seats_5: {
		name: 'Extra Seats (5-pack)',
		stripePriceId: process.env.STRIPE_PRICE_ADDON_SEATS_5 || null,
		monthlyAmount: 1500, // $15.00
		seats: 5,
	},
	communications: {
		name: 'Communications',
		stripePriceId: process.env.STRIPE_PRICE_ADDON_COMMS || null,
		monthlyAmount: 4900, // $49.00
		features: ['phone', 'sms', 'video', 'live_chat'] as readonly string[],
	},
	client_pack_starter: {
		name: 'Client Pack Starter',
		stripePriceId: process.env.STRIPE_PRICE_ADDON_CLIENT_STARTER || null,
		monthlyAmount: 2900, // $29.00
		clientSeats: 5,
		clientTokens: 50_000,
	},
	client_pack_pro: {
		name: 'Client Pack Pro',
		stripePriceId: process.env.STRIPE_PRICE_ADDON_CLIENT_PRO || null,
		monthlyAmount: 5900, // $59.00
		clientSeats: 10,
		clientTokens: 150_000,
	},
	client_pack_unlimited: {
		name: 'Client Pack Unlimited',
		stripePriceId: process.env.STRIPE_PRICE_ADDON_CLIENT_UNLIMITED || null,
		monthlyAmount: 12900, // $129.00
		clientSeats: -1, // unlimited
		clientTokens: 500_000,
	},
	white_label: {
		name: 'Companion White-Label',
		stripePriceId: process.env.STRIPE_PRICE_ADDON_WHITE_LABEL || null,
		monthlyAmount: 1900, // $19.00
	},
} as const;

export type EarnestAddonId = keyof typeof EARNEST_ADDONS;

/** Resolve an add-on ID from a Stripe price ID */
export function addonFromPriceId(stripePriceId: string): EarnestAddonId | null {
	for (const [key, addon] of Object.entries(EARNEST_ADDONS)) {
		if (addon.stripePriceId === stripePriceId) return key as EarnestAddonId;
	}
	return null;
}

/** Resolve the plan ID from a Stripe price ID (monthly or annual) */
export function planFromPriceId(stripePriceId: string): EarnestPlanId | null {
	for (const [key, plan] of Object.entries(EARNEST_PLANS)) {
		if (plan.stripePriceId === stripePriceId) return key as EarnestPlanId;
		if (plan.stripePriceIdAnnual === stripePriceId) return key as EarnestPlanId;
	}
	return null;
}

/**
 * The Directus `organizations.plan` enum shares its vocabulary with
 * EarnestPlanId. Valid stored values are:
 *   'free' | 'solo' | 'studio' | 'agency' | 'enterprise'
 * where 'free' = no active sub and 'enterprise' = hand-configured. The old
 * mapping helpers (earnestPlanToOrgPlan / orgPlanToEarnestPlan) are retired
 * — the identity function suffices.
 */
