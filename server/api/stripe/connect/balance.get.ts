// GET /api/stripe/connect/balance?organizationId=…
// Available + pending balances for the org's connected Stripe account.
import { useStripe } from '~~/server/utils/stripe';
import { requireConnectedAccount } from '~~/server/utils/stripe-connect';

export default defineEventHandler(async (event) => {
	const { stripeAccountId } = await requireConnectedAccount(event, { action: 'read' });

	const stripe = useStripe();
	const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });

	const sumByCurrency = (entries: { amount: number; currency: string }[]) => {
		const total: Record<string, number> = {};
		for (const e of entries) total[e.currency] = (total[e.currency] || 0) + e.amount;
		return total;
	};

	return {
		available: sumByCurrency(balance.available || []),
		pending: sumByCurrency(balance.pending || []),
		instantAvailable: sumByCurrency(balance.instant_available || []),
		// Each entry kept too in case the UI wants the raw breakdown later.
		raw: {
			available: balance.available || [],
			pending: balance.pending || [],
		},
	};
});
