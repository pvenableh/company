// server/api/stripe/payout/[id].get.ts
import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();
		const stripeSecretKey =
			process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

		if (!stripeSecretKey) {
			throw new Error('Stripe secret key is not configured');
		}

		const stripe = new Stripe(stripeSecretKey, {
			apiVersion: '2023-10-16',
		});

		const id = getRouterParam(event, 'id');
		if (!id) {
			return { error: 'ID is required' };
		}

		// Check if the ID is a charge ID (starts with 'ch_') or a payout ID (starts with 'po_')
		if (id.startsWith('ch_')) {
			// If it's a charge ID, first get the charge with expanded transfer data
			const charge = await stripe.charges.retrieve(id);

			if (!charge.transfer) {
				return { error: 'No transfer found for this charge' };
			}

			// Get the transfer details
			const transfer = await stripe.transfers.retrieve(charge.transfer as string);

			if (!transfer) {
				return { error: 'Transfer details not found' };
			}

			// Find associated payout using balance transactions
			const balanceTransactions = await stripe.balanceTransactions.list({
				type: 'transfer',
				source: transfer.id,
				limit: 1,
			});

			if (!balanceTransactions.data.length) {
				return { error: 'No balance transactions found' };
			}

			// Get payouts within the timeframe of the transfer
			const payouts = await stripe.payouts.list({
				created: {
					// Look for payouts around the transfer date
					gte: transfer.created - 86400, // 24 hours before
					lte: transfer.created + 86400, // 24 hours after
				},
				limit: 1,
				status: 'paid',
			});

			if (!payouts.data.length) {
				return { error: 'No payout found for this transfer' };
			}

			const payout = payouts.data[0];

			if (!payout?.id) {
				return { error: 'Invalid payout data' };
			}

			const transactions = await stripe.balanceTransactions.list({
				payout: payout.id as string,
				limit: 100,
			});

			return {
				payout,
				transactions: transactions.data,
				charge,
				transfer,
			};
		} else {
			// If it's a payout ID, proceed as before
			const payout = await stripe.payouts.retrieve(id);

			if (!payout?.id) {
				return { error: 'Invalid payout data' };
			}

			const transactions = await stripe.balanceTransactions.list({
				payout: payout.id as string,
				limit: 100,
			});

			return { payout, transactions: transactions.data };
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		console.error('Stripe payout error:', error);
		return { error: errorMessage };
	}
});
