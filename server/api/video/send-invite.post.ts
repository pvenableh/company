// server/api/video/send-invite.post.ts
// Send video meeting invite via SMS

import twilio from 'twilio';
import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('📨 SEND VIDEO INVITE REQUEST');
	console.log('='.repeat(60));

	try {
		const body = await readBody(event);

		const { roomName, phoneNumber, customMessage } = body;

		if (!roomName || !phoneNumber) {
			throw createError({
				statusCode: 400,
				message: 'Room name and phone number are required',
			});
		}

		// Format phone number
		let formattedPhone = phoneNumber.replace(/\D/g, '');
		if (!formattedPhone.startsWith('1') && formattedPhone.length === 10) {
			formattedPhone = '1' + formattedPhone;
		}
		if (!formattedPhone.startsWith('+')) {
			formattedPhone = '+' + formattedPhone;
		}

		console.log(`Sending invite to: ${formattedPhone}`);
		console.log(`Room: ${roomName}`);

		// Get meeting details from Directus
		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;
		let meetingTitle = 'Video Meeting';
		let meetingUrl = `${config.public.siteUrl}/meeting/${roomName}`;

		if (directusUrl && directusToken) {
			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

			try {
				const meetings = await directus.request(
					readItems('video_meetings', {
						filter: { room_name: { _eq: roomName } },
						fields: ['title', 'meeting_url'],
						limit: 1,
					}),
				);

				if (meetings.length > 0) {
					const meeting = meetings[0] as any;
					meetingTitle = meeting.title || meetingTitle;
					meetingUrl = meeting.meeting_url || meetingUrl;
				}
			} catch (dbError) {
				console.error('⚠️ Could not fetch meeting details:', dbError);
			}
		}

		// Send SMS via Twilio
		const twilioAccountSid = config.twilioAccountSid as string;
		const twilioAuthToken = config.twilioAuthToken as string;
		const twilioPhoneNumber = config.twilioPhoneNumber as string;

		if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
			throw createError({
				statusCode: 500,
				message: 'SMS service not configured',
			});
		}

		const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

		const messageBody =
			customMessage ||
			`You're invited to join a video meeting: ${meetingTitle}\n\nJoin here: ${meetingUrl}\n\n- Hue Creative Agency`;

		const message = await twilioClient.messages.create({
			body: messageBody,
			from: twilioPhoneNumber,
			to: formattedPhone,
		});

		console.log(`✅ SMS sent: ${message.sid}`);

		return {
			success: true,
			messageSid: message.sid,
			to: formattedPhone,
		};
	} catch (error: any) {
		console.error('❌ SEND INVITE ERROR:', error);

		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to send invite',
		});
	}
});
