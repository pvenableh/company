// POST /api/stripe/connect/refund
//
// Issues a refund on a connected-account charge and mirrors the result back
// to the matching `payments_received` row so the rest of the app sees the
// state change. Full or partial refunds supported (`amount` in cents; omit
// to refund the full charge).
//
// Auth: caller must hold `invoices:update` on the org. Demo accounts are
// blocked from issuing refunds (real money would move).
import { readItems, updateItem } from '@directus/sdk';
import { useStripe } from '~~/server/utils/stripe';
import { requireConnectedAccount } from '~~/server/utils/stripe-connect';

interface RefundBody {
	organizationId?: string;
	chargeId?: string;
	paymentIntentId?: string;
	amount?: number;
	reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
	note?: string;
}

export default defineEventHandler(async (event) => {
	await requireNotDemoSession(event);

	const body = await readBody<RefundBody>(event);
	if (!body?.chargeId && !body?.paymentIntentId) {
		throw createError({
			statusCode: 400,
			message: 'Either chargeId or paymentIntentId is required',
		});
	}

	const { organizationId, stripeAccountId } = await requireConnectedAccount(event, {
		action: 'update',
		organizationId: body.organizationId,
	});

	const stripe = useStripe();

	const refund = await stripe.refunds.create(
		{
			charge: body.chargeId,
			payment_intent: body.chargeId ? undefined : body.paymentIntentId,
			amount: body.amount && body.amount > 0 ? body.amount : undefined,
			reason: body.reason,
			metadata: {
				earnest_refund: '1',
				note: body.note || '',
				organization_id: organizationId,
			},
		},
		{ stripeAccount: stripeAccountId },
	);

	// Mirror to payments_received. Match by payment_intent first (most stable
	// identifier across the lifecycle), fall back to charge_id.
	const directus = getTypedDirectus();
	const piId = refund.payment_intent || body.paymentIntentId || null;
	const chId = (typeof refund.charge === 'string' ? refund.charge : refund.charge?.id) || body.chargeId || null;

	const matches = (await directus.request(
		readItems('payments_received', {
			filter: {
				_or: [
					...(piId ? [{ payment_intent: { _eq: piId } } as any] : []),
					...(chId ? [{ charge_id: { _eq: chId } } as any] : []),
				],
			},
			fields: ['id', 'note', 'stripe_status', 'amount'],
			limit: 1,
		}),
	)) as Array<{ id: string; note?: string | null; stripe_status?: string | null; amount?: string | null }>;

	const match = matches?.[0];
	let mirroredRowId: string | null = null;

	if (match) {
		const refundedFully =
			!body.amount ||
			(match.amount && Math.round(parseFloat(match.amount) * 100) === refund.amount);
		const note = [match.note?.trim(), `Refund issued ${new Date().toISOString().slice(0, 10)}: $${(refund.amount / 100).toFixed(2)}${body.note ? ` — ${body.note}` : ''}`]
			.filter(Boolean)
			.join('\n');

		await directus.request(
			updateItem('payments_received', match.id, {
				stripe_status: refundedFully ? 'refunded' : 'partially_refunded',
				note,
			}),
		);
		mirroredRowId = match.id;
	}

	return {
		refund: {
			id: refund.id,
			amount: refund.amount,
			currency: refund.currency,
			status: refund.status,
			created: refund.created,
			chargeId: chId,
			paymentIntentId: piId,
		},
		mirroredRowId,
	};
});
