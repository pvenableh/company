// server/api/scheduler/book.post.ts
//
// Free-booking endpoint. Paid bookings (event_type.price_cents > 0) take the
// /api/scheduler/booking-checkout → Stripe Checkout → /checkout-success path
// instead. Both paths converge on `finalizeBooking()` from
// server/utils/scheduler-finalize.ts.
import { readItem } from '@directus/sdk';
import { finalizeBooking } from '~~/server/utils/scheduler-finalize';

export default defineEventHandler(async (event) => {
	// Portal preview is read-only. A staff admin previewing a client's portal
	// carries the `portal_preview_as` cookie; block writes so a preview can't
	// book a real meeting on the client's behalf (mirrors contract-sign /
	// proposal-action). Genuine public + client bookings never set this cookie.
	if (getCookie(event, 'portal_preview_as')) {
		throw createError({ statusCode: 403, message: 'Portal preview is read-only — booking is disabled while previewing as a client.' });
	}

	const body = await readBody(event);

	const {
		hostUserId,
		eventTypeId,
		title,
		meetingType,
		scheduledStart,
		scheduledEnd,
		durationMinutes,
		inviteeName,
		inviteeEmail,
		inviteePhone,
		bookingNotes,
		intakeResponses,
	} = body;

	if (!hostUserId || !scheduledStart || !inviteeEmail) {
		throw createError({
			statusCode: 400,
			message: 'Missing required fields: hostUserId, scheduledStart, inviteeEmail',
		});
	}

	// Block paid event types from this endpoint — they must take the Checkout path.
	if (eventTypeId) {
		try {
			const directus = getTypedDirectus();
			const et = (await directus.request(
				readItem('event_types' as any, eventTypeId, { fields: ['id', 'price_cents'] } as any),
			)) as { id: number; price_cents?: number | null } | null;
			if (et && (et.price_cents ?? 0) > 0) {
				throw createError({
					statusCode: 402,
					message: 'This event type requires payment. Use /api/scheduler/booking-checkout.',
				});
			}
		} catch (err: any) {
			if (err?.statusCode === 402) throw err;
			console.warn('[book] price-gate lookup failed:', err?.message);
		}
	}

	try {
		const result = await finalizeBooking({
			hostUserId,
			eventTypeId: eventTypeId ?? null,
			title,
			meetingType,
			scheduledStart,
			scheduledEnd,
			durationMinutes,
			inviteeName,
			inviteeEmail,
			inviteePhone,
			bookingNotes,
			intakeResponses,
		});

		return {
			success: true,
			meeting: result.meeting,
			appointmentId: result.appointmentId,
			contactMatched: result.contactMatched,
		};
	} catch (error: any) {
		console.error('Error creating booking:', error);
		throw createError({
			statusCode: error.status || error.statusCode || 500,
			message: error.message || 'Failed to create booking',
		});
	}
});
