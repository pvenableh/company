// POST /api/scheduler/booking-checkout
//
// Stage 5 of the "Me" lens plan — paid bookings.
//
// Public endpoint. The visitor has selected a paid event type and filled out
// the booking form. We:
//   1. Validate the event type exists, is paid, and the host's org has an
//      active Stripe Connect account.
//   2. Pack the booking payload into the Checkout Session metadata (sliced
//      across keys to fit Stripe's 500-char-per-value limit).
//   3. Create a Checkout Session in `payment` mode on the connected account
//      (Standard accounts: funds settle directly; we take an optional
//      application_fee_amount per the existing platform-fee bps).
//   4. Return { url, sessionId } — the client redirects to Stripe.
//
// Booking creation is deferred to /checkout-success and the connect webhook,
// which both call finalizeBooking() with the metadata payload + sessionId for
// idempotency. This avoids holding pending appointment rows during payment.
import { readItem } from '@directus/sdk';
import Stripe from 'stripe';
import { useStripe } from '~~/server/utils/stripe';

interface Body {
	hostUserId: string;
	eventTypeId: number;
	scheduledStart: string;
	scheduledEnd?: string | null;
	durationMinutes?: number | null;
	inviteeName?: string | null;
	inviteeEmail: string;
	inviteePhone?: string | null;
	bookingNotes?: string | null;
	intakeResponses?: Record<string, any> | null;
	/** Where to send the visitor when payment succeeds (full URL). */
	successUrl: string;
	/** Where to send the visitor on cancel (full URL). */
	cancelUrl: string;
}

// Stripe metadata: 50 keys max, 500 chars per value, 40 chars per key.
const META_VALUE_LIMIT = 500;

function chunkValue(value: string, prefix: string, out: Record<string, string>) {
	if (value.length <= META_VALUE_LIMIT) {
		out[prefix] = value;
		return;
	}
	const chunks = Math.ceil(value.length / META_VALUE_LIMIT);
	for (let i = 0; i < chunks; i++) {
		out[`${prefix}_${i}`] = value.slice(i * META_VALUE_LIMIT, (i + 1) * META_VALUE_LIMIT);
	}
	out[`${prefix}_chunks`] = String(chunks);
}

export default defineEventHandler(async (event) => {
	// Portal preview is read-only — block the paid path too (mirrors book.post.ts).
	if (getCookie(event, 'portal_preview_as')) {
		throw createError({ statusCode: 403, message: 'Portal preview is read-only — booking is disabled while previewing as a client.' });
	}

	const config = useRuntimeConfig();
	const stripe = useStripe();
	const body = await readBody<Body>(event);

	if (!body?.hostUserId || !body?.eventTypeId || !body?.scheduledStart || !body?.inviteeEmail) {
		throw createError({
			statusCode: 400,
			message: 'Missing required fields: hostUserId, eventTypeId, scheduledStart, inviteeEmail',
		});
	}
	if (!body.successUrl || !body.cancelUrl) {
		throw createError({ statusCode: 400, message: 'successUrl and cancelUrl are required' });
	}

	const directus = getTypedDirectus();

	// Resolve event type + the host's org (price + Connect status live there).
	const eventType = (await directus
		.request(
			readItem('event_types' as any, body.eventTypeId, {
				fields: [
					'id',
					'title',
					'duration',
					'price_cents',
					'enabled',
					'status',
					'organization.id',
					'organization.name',
					'organization.stripe_account_id',
					'organization.stripe_account_status',
				],
			} as any),
		)
		.catch(() => null)) as
		| {
				id: number;
				title: string;
				duration: number;
				price_cents?: number | null;
				enabled?: boolean;
				status?: string;
				organization?: {
					id: string;
					name: string;
					stripe_account_id?: string | null;
					stripe_account_status?: string | null;
				} | null;
		  }
		| null;

	if (!eventType || eventType.status !== 'published' || eventType.enabled === false) {
		throw createError({ statusCode: 404, message: 'Event type not found' });
	}

	const priceCents = eventType.price_cents ?? 0;
	if (priceCents <= 0) {
		throw createError({
			statusCode: 400,
			message: 'This event type is free — use /api/scheduler/book instead.',
		});
	}
	if (priceCents < 50) {
		// Stripe minimum charge is $0.50.
		throw createError({ statusCode: 400, message: 'Price must be at least $0.50.' });
	}

	const org = eventType.organization;
	if (!org?.stripe_account_id) {
		throw createError({
			statusCode: 412,
			message: `${org?.name || 'This organization'} hasn't connected a Stripe account yet — paid bookings can't be processed.`,
		});
	}
	if (org.stripe_account_status !== 'active') {
		throw createError({
			statusCode: 412,
			message: `${org.name} is still finishing Stripe onboarding. Try again later or pick a different time.`,
		});
	}

	// Optional platform fee (bps applied to price_cents).
	const bps = parseInt(String(config?.stripePlatformFeeBps || '0'), 10) || 0;
	const applicationFeeAmount = bps > 0 ? Math.floor((priceCents * bps) / 10_000) : 0;

	// Pack the booking payload into Stripe metadata. Long values get chunked.
	const metadata: Record<string, string> = {
		kind: 'scheduler_booking',
		host_user_id: body.hostUserId,
		event_type_id: String(body.eventTypeId),
		scheduled_start: body.scheduledStart,
		scheduled_end: body.scheduledEnd || '',
		duration_minutes: String(body.durationMinutes || eventType.duration || 30),
		invitee_email: body.inviteeEmail,
		invitee_name: (body.inviteeName || '').slice(0, META_VALUE_LIMIT),
		invitee_phone: (body.inviteePhone || '').slice(0, META_VALUE_LIMIT),
	};
	if (body.bookingNotes) chunkValue(body.bookingNotes, 'booking_notes', metadata);
	if (body.intakeResponses && typeof body.intakeResponses === 'object') {
		chunkValue(JSON.stringify(body.intakeResponses), 'intake_responses', metadata);
	}

	try {
		const session = await stripe.checkout.sessions.create(
			{
				mode: 'payment',
				payment_method_types: ['card'],
				customer_email: body.inviteeEmail,
				success_url: body.successUrl,
				cancel_url: body.cancelUrl,
				line_items: [
					{
						quantity: 1,
						price_data: {
							currency: 'usd',
							unit_amount: priceCents,
							product_data: {
								name: eventType.title,
								description: `${body.durationMinutes || eventType.duration || 30}-minute session on ${new Date(body.scheduledStart).toLocaleString()}`,
							},
						},
					},
				],
				payment_intent_data: {
					...(applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {}),
					metadata,
				},
				metadata,
			} as Stripe.Checkout.SessionCreateParams,
			{ stripeAccount: org.stripe_account_id },
		);

		return { url: session.url, sessionId: session.id };
	} catch (err: any) {
		if (err instanceof Stripe.errors.StripeError) {
			throw createError({
				statusCode: err.statusCode || 400,
				message: err.message,
				data: { code: err.code, type: err.type },
			});
		}
		console.error('[booking-checkout] error:', err);
		throw createError({ statusCode: 500, message: 'Failed to create checkout session' });
	}
});
