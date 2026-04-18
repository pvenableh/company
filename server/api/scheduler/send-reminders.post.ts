// server/api/scheduler/send-reminders.post.ts
// This endpoint should be called by a cron job every 5-15 minutes
// Example: Vercel Cron, GitHub Actions, or external service like cron-job.org

import { createDirectus, rest, readItems, updateItem, readUser } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	
	// Verify cron secret (optional but recommended)
	const authHeader = getHeader(event, 'authorization');
	const cronSecret = config.cronSecret;
	
	if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
		throw createError({
			statusCode: 401,
			message: 'Unauthorized',
		});
	}

	const client = createDirectus(config.public.directusUrl).with(rest());
	const staticToken = config.directusServerToken;
	if (staticToken) {
		client.setToken(staticToken);
	}

	const results = {
		checked: 0,
		emailsSent: 0,
		smsSent: 0,
		errors: [] as string[],
	};

	try {
		const now = new Date();
		
		// Find meetings that need reminders
		// Look for meetings starting in the next 2 hours that haven't had reminders sent
		const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

		const meetings = await client.request(
			readItems('video_meetings', {
				fields: [
					'id',
					'room_name',
					'title',
					'scheduled_start',
					'invitee_email',
					'invitee_phone',
					'invitee_name',
					'invite_method',
					'reminder_sent',
					'reminder_minutes_before',
					'host_user',
					'host_identity',
				],
				filter: {
					_and: [
						{ status: { _eq: 'scheduled' } },
						{ reminder_sent: { _eq: false } },
						{ scheduled_start: { _gte: now.toISOString() } },
						{ scheduled_start: { _lte: twoHoursFromNow.toISOString() } },
					],
				},
				limit: 50,
			})
		);

		results.checked = meetings.length;

		for (const meeting of meetings) {
			const startTime = new Date(meeting.scheduled_start);
			const reminderTime = meeting.reminder_minutes_before || 60;
			const reminderThreshold = new Date(startTime.getTime() - reminderTime * 60 * 1000);

			// Check if it's time to send the reminder
			if (now >= reminderThreshold) {
				try {
					// Send email reminder
					if (meeting.invitee_email && ['email', 'both'].includes(meeting.invite_method || 'email')) {
						await $fetch('/api/video/send-email-invite', {
							method: 'POST',
							body: {
								meetingId: meeting.id,
								roomName: meeting.room_name,
								toEmail: meeting.invitee_email,
								toName: meeting.invitee_name,
								scheduledStart: meeting.scheduled_start,
								hostName: meeting.host_identity,
								customMessage: `Reminder: Your meeting starts in ${reminderTime} minutes!`,
							},
						});
						results.emailsSent++;
					}

					// Send SMS reminder
					if (meeting.invitee_phone && ['sms', 'both'].includes(meeting.invite_method || '')) {
						await $fetch('/api/video/send-invite', {
							method: 'POST',
							body: {
								roomName: meeting.room_name,
								phoneNumber: meeting.invitee_phone,
								meetingId: meeting.id,
								customMessage: `Reminder: Your video meeting "${meeting.title}" starts in ${reminderTime} minutes!`,
							},
						});
						results.smsSent++;
					}

					// Mark reminder as sent
					await client.request(
						updateItem('video_meetings', meeting.id, {
							reminder_sent: true,
							reminder_sent_at: now.toISOString(),
						})
					);

					// Also send reminder to host
					if (meeting.host_user) {
						try {
							const hostUser = await client.request(
								readUser(meeting.host_user, {
									fields: ['email', 'first_name'],
								})
							);

							if (hostUser.email) {
								await $fetch('/api/video/send-email-invite', {
									method: 'POST',
									body: {
										roomName: meeting.room_name,
										toEmail: hostUser.email,
										toName: hostUser.first_name,
										scheduledStart: meeting.scheduled_start,
										hostName: meeting.invitee_name || 'Guest',
										customMessage: `Reminder: Your meeting with ${meeting.invitee_name || 'a guest'} starts in ${reminderTime} minutes!`,
										isHostNotification: true,
									},
								});
							}
						} catch (e) {
							console.error('Failed to send host reminder:', e);
						}
					}
				} catch (error: any) {
					results.errors.push(`Meeting ${meeting.id}: ${error.message}`);
				}
			}
		}

		// Also check for appointments that need reminders
		const appointments = await client.request(
			readItems('appointments', {
				fields: [
					'id',
					'title',
					'start_time',
					'reminder_sent',
					'is_video',
					'video_meeting',
				],
				filter: {
					_and: [
						{ status: { _neq: 'canceled' } },
						{ reminder_sent: { _neq: true } },
						{ is_video: { _eq: false } },
						{ start_time: { _gte: now.toISOString() } },
						{ start_time: { _lte: twoHoursFromNow.toISOString() } },
					],
				},
				limit: 50,
			})
		);

		// Process appointment reminders (simplified - would need attendee info)
		for (const appt of appointments) {
			const startTime = new Date(appt.start_time);
			const reminderThreshold = new Date(startTime.getTime() - 60 * 60 * 1000); // 1 hour before

			if (now >= reminderThreshold) {
				await client.request(
					updateItem('appointments', appt.id, {
						reminder_sent: true,
					})
				);
			}
		}

		return {
			success: true,
			...results,
			timestamp: now.toISOString(),
		};
	} catch (error: any) {
		console.error('Error processing reminders:', error);
		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to process reminders',
		});
	}
});
