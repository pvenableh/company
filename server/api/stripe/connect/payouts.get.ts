// GET /api/stripe/connect/payouts?organizationId=…&limit=…&starting_after=…
// Bank payouts from the connected account. Replaces the leaky platform-level
// /api/stripe/payouts that exposed Hue's bank deposits.
import { useStripe } from '~~/server/utils/stripe';
import { requireConnectedAccount } from '~~/server/utils/stripe-connect';

export default defineEventHandler(async (event) => {
	const { stripeAccountId } = await requireConnectedAccount(event, { action: 'read' });

	const query = getQuery(event);
	const limit = Math.min(Math.max(parseInt(String(query.limit || '20'), 10) || 20, 1), 100);
	const startingAfter = (query.starting_after as string | undefined) || undefined;

	const stripe = useStripe();
	const payouts = await stripe.payouts.list(
		{ limit, starting_after: startingAfter },
		{ stripeAccount: stripeAccountId },
	);

	return {
		data: payouts.data.map((p) => ({
			id: p.id,
			amount: p.amount,
			currency: p.currency,
			status: p.status,
			arrivalDate: p.arrival_date,
			created: p.created,
			method: p.method,
			type: p.type,
			statementDescriptor: p.statement_descriptor,
			failureCode: p.failure_code,
			failureMessage: p.failure_message,
			automatic: p.automatic,
		})),
		hasMore: payouts.has_more,
	};
});
