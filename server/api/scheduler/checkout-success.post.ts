// POST /api/scheduler/checkout-success
//
// Stage 5 — paid booking finalize-on-return path.
//
// Public endpoint hit by the booking page after Stripe redirects the visitor
// back with `?session_id=…`. We:
//   1. Resolve the connected account via the eventTypeId the client passes
//      (event_type → organization → stripe_account_id).
//   2. Fetch the Checkout Session on that connected account and verify
//      `payment_status === 'paid'`.
//   3. Reconstruct the booking payload from session.metadata (with chunk
//      reassembly) and call finalizeBooking() with `paymentSessionId` set —
//      that's the idempotency key, so a webhook racing us is harmless.
//   4. Return the meeting object so the BookingFlow can render confirmation.
import { readItem, readItems, createItem } from '@directus/sdk';
import Stripe from 'stripe';
import { useStripe } from '~~/server/utils/stripe';
import { finalizeBooking } from '~~/server/utils/scheduler-finalize';

interface Body {
	sessionId: string;
	eventTypeId: number;
}

function reassemble(meta: Record<string, string>, key: string): string | null {
	if (meta[key]) return meta[key];
	const chunkCount = parseInt(meta[`${key}_chunks`] || '0', 10);
	if (!chunkCount) return null;
	let out = '';
	for (let i = 0; i < chunkCount; i++) {
		out += meta[`${key}_${i}`] || '';
	}
	return out;
}

export default defineEventHandler(async (event) => {
	const stripe = useStripe();
	const body = await readBody<Body>(event);
	const { sessionId, eventTypeId } = body || ({} as Body);

	if (!sessionId || !sessionId.startsWith('cs_')) {
		throw createError({ statusCode: 400, message: 'Valid sessionId is required' });
	}
	if (!eventTypeId) {
		throw createError({ statusCode: 400, message: 'eventTypeId is required' });
	}

	const directus = getTypedDirectus();
	const eventType = (await directus
		.request(
			readItem('event_types' as any, eventTypeId, {
				fields: [
					'id',
					'title',
					'organization.id',
					'organization.stripe_account_id',
				],
			} as any),
		)
		.catch(() => null)) as
		| {
				id: number;
				title?: string;
				organization?: { id: string; stripe_account_id?: string | null } | null;
		  }
		| null;

	const accountId = eventType?.organization?.stripe_account_id;
	const orgId = eventType?.organization?.id || null;
	if (!accountId) {
		throw createError({ statusCode: 404, message: 'Event type or merchant account not found' });
	}

	let session: Stripe.Checkout.Session;
	try {
		session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: accountId });
	} catch (err: any) {
		throw createError({
			statusCode: err?.statusCode || 404,
			message: err?.message || 'Checkout session not found',
		});
	}

	if (session.payment_status !== 'paid') {
		throw createError({
			statusCode: 402,
			message: `Payment is not complete (status: ${session.payment_status}).`,
		});
	}

	const meta = (session.metadata || {}) as Record<string, string>;
	if (meta.kind !== 'scheduler_booking') {
		throw createError({ statusCode: 400, message: 'Session is not for a scheduler booking.' });
	}

	const intakeRaw = reassemble(meta, 'intake_responses');
	let intakeResponses: Record<string, any> | null = null;
	if (intakeRaw) {
		try {
			intakeResponses = JSON.parse(intakeRaw);
		} catch {
			intakeResponses = null;
		}
	}

	const result = await finalizeBooking({
		hostUserId: meta.host_user_id!,
		eventTypeId,
		title: eventType?.title
			? `${eventType.title} with ${meta.invitee_name || meta.invitee_email}`
			: null,
		meetingType: 'consultation',
		scheduledStart: meta.scheduled_start!,
		scheduledEnd: meta.scheduled_end || null,
		durationMinutes: parseInt(meta.duration_minutes || '0', 10) || null,
		inviteeName: meta.invitee_name || null,
		inviteeEmail: meta.invitee_email!,
		inviteePhone: meta.invitee_phone || null,
		bookingNotes: reassemble(meta, 'booking_notes') || null,
		intakeResponses,
		paymentSessionId: sessionId,
	});

	// Best-effort payments_received row. The webhook may also write this; both
	// paths dedupe on payment_intent.
	if (!result.reused) {
		try {
			await recordPaymentReceived(session, accountId, orgId);
		} catch (err: any) {
			console.warn('[checkout-success] payments_received write failed:', err?.message);
		}
	}

	return {
		success: true,
		meeting: result.meeting,
		appointmentId: result.appointmentId,
		reused: result.reused,
	};
});

async function recordPaymentReceived(
	session: Stripe.Checkout.Session,
	connectedAccountId: string,
	orgId: string | null,
) {
	const directus = getTypedDirectus();
	const piId =
		typeof session.payment_intent === 'string'
			? session.payment_intent
			: session.payment_intent?.id || null;
	if (!piId) return;

	const existing = (await directus.request(
		readItems('payments_received', {
			filter: { payment_intent: { _eq: piId } },
			fields: ['id'],
			limit: 1,
		}),
	)) as Array<{ id: string }>;
	if (existing.length > 0) return;

	const stripe = useStripe();
	let receiptUrl: string | null = null;
	let paymentMethodType: string | null = null;
	try {
		const pi = await stripe.paymentIntents.retrieve(piId, { stripeAccount: connectedAccountId });
		const charge = (pi.latest_charge as Stripe.Charge | string | null) || null;
		if (charge && typeof charge !== 'string') {
			receiptUrl = charge.receipt_url || null;
			paymentMethodType = charge.payment_method_details?.type || null;
		} else if (typeof charge === 'string') {
			const c = await stripe.charges.retrieve(charge, { stripeAccount: connectedAccountId });
			receiptUrl = c.receipt_url || null;
			paymentMethodType = c.payment_method_details?.type || null;
		}
	} catch {
		// non-fatal
	}

	await directus.request(
		createItem('payments_received', {
			payment_intent: piId,
			receipt_url: receiptUrl,
			stripe_status: 'succeeded',
			amount: ((session.amount_total || 0) / 100).toFixed(2),
			organization: orgId,
			status: 'paid',
			payment_method: paymentMethodType,
			date_received: new Date().toISOString(),
			note: `Booking payment via Stripe Checkout (session ${session.id})`,
		}),
	);
}
