// GET /api/stripe/connect/refunds?organizationId=…&limit=…&starting_after=…
// All refunds issued from the connected account.
import { useStripe } from '~~/server/utils/stripe';
import { requireConnectedAccount } from '~~/server/utils/stripe-connect';

export default defineEventHandler(async (event) => {
	const { stripeAccountId } = await requireConnectedAccount(event, { action: 'read' });

	const query = getQuery(event);
	const limit = Math.min(Math.max(parseInt(String(query.limit || '20'), 10) || 20, 1), 100);
	const startingAfter = (query.starting_after as string | undefined) || undefined;

	const stripe = useStripe();
	const refunds = await stripe.refunds.list(
		{ limit, starting_after: startingAfter, expand: ['data.charge'] },
		{ stripeAccount: stripeAccountId },
	);

	return {
		data: refunds.data.map((r) => {
			const charge: any = r.charge && typeof r.charge !== 'string' ? r.charge : null;
			return {
				id: r.id,
				amount: r.amount,
				currency: r.currency,
				status: r.status,
				reason: r.reason,
				created: r.created,
				chargeId: typeof r.charge === 'string' ? r.charge : charge?.id,
				paymentIntentId: r.payment_intent || charge?.payment_intent || null,
				receiptUrl: charge?.receipt_url || null,
				invoiceId: charge?.metadata?.invoice_id || null,
				invoiceCode: charge?.metadata?.invoice_code || null,
			};
		}),
		hasMore: refunds.has_more,
	};
});
