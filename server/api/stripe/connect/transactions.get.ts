// GET /api/stripe/connect/transactions?organizationId=…&limit=…&starting_after=…
// Settled & pending balance transactions for the connected account: charges,
// refunds, fees, payouts. The UI's primary "Activity" view.
import { useStripe } from '~~/server/utils/stripe';
import { requireConnectedAccount } from '~~/server/utils/stripe-connect';

export default defineEventHandler(async (event) => {
	const { stripeAccountId } = await requireConnectedAccount(event, { action: 'read' });

	const query = getQuery(event);
	const limit = Math.min(Math.max(parseInt(String(query.limit || '20'), 10) || 20, 1), 100);
	const startingAfter = (query.starting_after as string | undefined) || undefined;
	const type = (query.type as string | undefined) || undefined;

	const stripe = useStripe();
	const txns = await stripe.balanceTransactions.list(
		{
			limit,
			starting_after: startingAfter,
			type: type as any,
			expand: ['data.source'],
		},
		{ stripeAccount: stripeAccountId },
	);

	return {
		data: txns.data.map((t) => {
			const source: any = t.source;
			const charge = source && source.object === 'charge' ? source : null;
			return {
				id: t.id,
				type: t.type,
				status: t.status,
				amount: t.amount,
				fee: t.fee,
				net: t.net,
				currency: t.currency,
				description: t.description,
				created: t.created,
				availableOn: t.available_on,
				sourceId: typeof t.source === 'string' ? t.source : t.source?.id || null,
				charge: charge
					? {
							id: charge.id,
							paymentIntent: charge.payment_intent,
							receiptUrl: charge.receipt_url,
							refunded: charge.refunded,
							amountRefunded: charge.amount_refunded,
							invoiceId: charge.metadata?.invoice_id || null,
							invoiceCode: charge.metadata?.invoice_code || null,
						}
					: null,
			};
		}),
		hasMore: txns.has_more,
	};
});
