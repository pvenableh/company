// server/api/video/create-room.post.ts
import { createItem, readItem, updateItem } from '@directus/sdk';
import { renderOrgEmail, escapeHtml, type OrgBrandRef } from '~~/server/utils/email-shell';
import { sendBrandedEmail, fetchOrgBrand } from '~~/server/utils/email-send';

interface AttendeeInput {
	name?: string;
	email?: string;
	phone?: string;
	invite_method?: 'none' | 'email' | 'sms' | 'both';
}

interface ContactInput {
	contact_id: string;
	name?: string;
	email?: string;
	phone?: string;
	invite_method?: 'none' | 'email' | 'sms' | 'both';
}

interface CreateRoomBody {
	title: string;
	description?: string;
	scheduled_start: string;
	duration?: number;
	invitee_name?: string;
	invitee_email?: string;
	invitee_phone?: string;
	invite_method?: 'none' | 'email' | 'sms' | 'both';
	meeting_type?: string;
	waiting_room_enabled?: boolean;
	recording_enabled?: boolean;
	transcription_enabled?: boolean;
	attendees?: AttendeeInput[];
	/** Picker-added contacts. Each becomes a video_meeting_attendees row with `contact` FK populated. */
	contacts?: ContactInput[];
	/** Directus user IDs to link as teammate attendees via appointments_directus_users. */
	members?: string[];
	custom_message?: string;
	related_lead?: number | string | null;
	project?: string | null;
	project_event?: string | null;
	organization?: string | null;
	client?: string | null;
}

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();

		// Get session from nuxt-auth-utils
		const session = await getUserSession(event);

		if (!session?.user?.id) {
			throw createError({
				statusCode: 401,
				message: 'Unauthorized - Please sign in',
			});
		}

		const userId = session.user.id;
		const userName = `${session.user.first_name || ''} ${session.user.last_name || ''}`.trim() || 'Host';

		// Get request body
		const body = await readBody<CreateRoomBody>(event);

		if (!body.title) {
			throw createError({
				statusCode: 400,
				message: 'Meeting title is required',
			});
		}

		// Generate unique room name
		const roomName = `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

		// Calculate scheduled end time with validation
		const scheduledStart = new Date(body.scheduled_start);

		// Validate the date is valid
		if (isNaN(scheduledStart.getTime())) {
			throw createError({
				statusCode: 400,
				message: 'Invalid scheduled start time. Please select a valid date and time.',
			});
		}

		const durationMinutes = Number(body.duration) || 30;
		const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);

		// Detect "instant" meetings (the InstantMeetingButton creates these with
		// `scheduled_start: now`). These start immediately, so we shouldn't show
		// them as `scheduled` in the meetings list — they're live the moment the
		// host hits the button. Even if the Daily webhook fires `meeting.started`
		// later, a 30-second list refresh window of the wrong status is the bug
		// the user reported (Item 12).
		const isInstant = Math.abs(scheduledStart.getTime() - Date.now()) < 60_000;

		// Resolve recording / transcription off the org's plan + per-org overrides.
		// Body wins when explicitly set; otherwise we fall through to plan defaults.
		// Free-tier orgs can't request either feature — assertFeatureAllowed will 402.
		const orgIdForDefaults = (body.organization as string | null) || null;
		const meetingDefaults = orgIdForDefaults
			? await fetchOrgMeetingDefaults(orgIdForDefaults)
			: null;
		const recordingEnabled = typeof body.recording_enabled === 'boolean'
			? body.recording_enabled
			: (meetingDefaults?.recording ?? false);
		const transcriptionEnabled = typeof body.transcription_enabled === 'boolean'
			? body.transcription_enabled
			: (meetingDefaults?.transcription ?? false);
		if (meetingDefaults) {
			assertFeatureAllowed(meetingDefaults, 'recording', recordingEnabled);
			assertFeatureAllowed(meetingDefaults, 'transcription', transcriptionEnabled);
		}

		// Create Daily.co video room
		let dailyRoom;
		try {
			dailyRoom = await createDailyRoom({
				name: roomName,
				expiresAt: new Date(scheduledEnd.getTime() + 60 * 60 * 1000), // 1hr buffer after scheduled end
				maxParticipants: 25,
				enableRecording: recordingEnabled,
				enableTranscription: transcriptionEnabled,
				enableKnocking: body.waiting_room_enabled ?? false,
			});
		} catch (dailyError: any) {
			console.error('Daily.co room creation error:', dailyError);
			throw createError({
				statusCode: 500,
				message: `Failed to create video room: ${dailyError.message}`,
			});
		}

		// Get Directus client with user's session token
		const directus = await getUserDirectus(event);

		// Use the Daily.co room URL as the meeting URL (iframe-based prebuilt UI)
		const meetingUrl = dailyRoom.url;

		// Create video meeting record in Directus
		const videoMeetingData: Record<string, any> = {
			room_name: roomName,
			room_sid: dailyRoom.id,
			title: body.title,
			description: body.description || null,
			meeting_type: body.meeting_type || 'general',
			duration_minutes: durationMinutes,
			scheduled_start: scheduledStart.toISOString(),
			scheduled_end: scheduledEnd.toISOString(),
			status: isInstant ? 'in_progress' : 'scheduled',
			actual_start: isInstant ? scheduledStart.toISOString() : null,
			host_identity: userName,
			host_user: userId,
			meeting_url: meetingUrl,
			invitee_name: body.invitee_name || null,
			invitee_email: body.invitee_email || null,
			invitee_phone: body.invitee_phone || null,
			invite_method: body.invite_method || 'none',
			invite_sent: false,
			waiting_room_enabled: body.waiting_room_enabled ?? false,
			recording_enabled: recordingEnabled,
			transcription_enabled: transcriptionEnabled,
			booked_via: isInstant ? 'instant' : 'direct',
		};

		if (body.related_lead) {
			videoMeetingData.related_lead = body.related_lead;
		}
		if (body.project) {
			videoMeetingData.project = body.project;
		}
		if (body.project_event) {
			videoMeetingData.project_event = body.project_event;
		}
		if (orgIdForDefaults) {
			videoMeetingData.related_organization = orgIdForDefaults;
		}

		// Auto-fill `client` from the project's client when the meeting is linked
		// to a project and the caller didn't explicitly send a client. Lets the
		// scheduler picker rank the meeting-client's contacts to the top.
		if (body.client) {
			videoMeetingData.client = body.client;
		} else if (body.project) {
			try {
				const proj = (await directus.request(
					readItem('projects', body.project, { fields: ['client'] as any }),
				)) as any;
				const projClient = typeof proj?.client === 'object' ? proj.client?.id : proj?.client;
				if (projClient) videoMeetingData.client = projClient;
			} catch (err) {
				console.warn('[create-room] failed to resolve project client:', err);
			}
		}

		const videoMeeting = await directus.request(
			createItem('video_meetings', videoMeetingData),
		);

		// Create corresponding appointment record
		const appointmentData: Record<string, any> = {
			title: body.title,
			description: body.description || null,
			start_time: scheduledStart.toISOString(),
			end_time: scheduledEnd.toISOString(),
			status: 'confirmed',
			is_video: true,
			video_meeting: videoMeeting.id,
			meeting_link: meetingUrl,
			room_name: roomName,
		};

		if (body.related_lead) {
			appointmentData.related_lead = body.related_lead;
		}

		const appointment = await directus.request(
			createItem('appointments', appointmentData),
		);

		// Link video meeting back to the appointment via related_appointment
		try {
			await directus.request(
				updateItem('video_meetings', videoMeeting.id, {
					related_appointment: appointment.id,
				}),
			);
		} catch (linkError) {
			console.error('Failed to link video meeting to appointment:', linkError);
		}

		// Link teammate members (Directus users) to the appointment, and notify
		// them in-app + via email. Host is skipped inside notifyMeetingChange.
		const memberIds = (body.members || []).filter((id) => id && id !== userId);
		if (memberIds.length > 0) {
			for (const memberId of memberIds) {
				try {
					await directus.request(
						createItem('appointments_directus_users', {
							appointments_id: appointment.id,
							directus_users_id: memberId,
						} as any),
					);
				} catch (junctionError) {
					console.error('Failed to link member to appointment:', memberId, junctionError);
				}
			}

			try {
				await notifyMeetingChange({
					event: { kind: 'invited' },
					meeting: {
						id: videoMeeting.id,
						title: body.title,
						meeting_url: meetingUrl,
						scheduled_start: scheduledStart.toISOString(),
						duration_minutes: durationMinutes,
						orgId: orgIdForDefaults || null,
					},
					recipientIds: memberIds,
					hostId: userId,
					hostName: userName,
				});
			} catch (notifyError) {
				console.error('Failed to notify members on meeting create:', notifyError);
			}
		}

		// Auto-create lead activity if linked to a lead
		if (body.related_lead) {
			try {
				await directus.request(
					createItem('lead_activities', {
						activity_type: 'meeting',
						activity_date: scheduledStart.toISOString(),
						subject: body.title,
						description: `Video meeting scheduled: ${body.title}`,
						lead: body.related_lead,
						related_video_meeting: videoMeeting.id,
						status: 'published',
					}),
				);
			} catch (activityError) {
				console.error('Failed to auto-create lead activity:', activityError);
			}
		}

		// Create attendee records and send invitations
		let inviteSent = false;

		// Resolve org brand once for all external-guest invite emails on this room.
		const orgBrandForInvites = orgIdForDefaults ? await fetchOrgBrand(orgIdForDefaults) : null;

		// Handle attendees array from the modal
		const attendeesList: Array<AttendeeInput & { contact_id?: string }> = body.attendees?.filter((a) => a.name || a.email) || [];

		// Picker-added contacts: same write path as guests, but with `contact` FK
		// set so they round-trip back as avatar chips in edit mode.
		for (const c of body.contacts || []) {
			if (!c?.contact_id) continue;
			attendeesList.push({
				contact_id: c.contact_id,
				name: c.name || '',
				email: c.email || '',
				phone: c.phone || '',
				invite_method: c.invite_method || (c.email ? 'email' : 'none'),
			});
		}

		// If no attendees array but legacy single invitee fields exist, convert them
		if (attendeesList.length === 0 && (body.invitee_name || body.invitee_email)) {
			attendeesList.push({
				name: body.invitee_name,
				email: body.invitee_email,
				phone: body.invitee_phone,
				invite_method: body.invite_method || 'none',
			});
		}

		for (const attendeeInput of attendeesList) {
			try {
				// Create attendee record in Directus
				await directus.request(
					createItem('video_meeting_attendees', {
						video_meeting: videoMeeting.id,
						attendee_type: 'guest',
						contact: attendeeInput.contact_id || null,
						guest_name: attendeeInput.name || null,
						guest_email: attendeeInput.email || null,
						guest_phone: attendeeInput.phone || null,
						status: 'invited',
						invite_method: attendeeInput.invite_method || 'none',
					} as any),
				);

				const method = attendeeInput.invite_method || 'none';
				if (method === 'none') continue;

				// Send email invitation
				if ((method === 'email' || method === 'both') && attendeeInput.email) {
					await sendEmailInvitation({
						to: attendeeInput.email,
						guestName: attendeeInput.name || 'Guest',
						hostName: userName,
						meetingTitle: body.title,
						meetingUrl,
						scheduledStart,
						durationMinutes,
						org: orgBrandForInvites,
						meetingId: videoMeeting.id,
					});
					inviteSent = true;
				}

				// Send SMS invitation (uses Twilio messaging, not video)
				if ((method === 'sms' || method === 'both') && attendeeInput.phone) {
					try {
						const twilio = await import('twilio');
						const twilioClient = twilio.default(config.twilioAccountSid, config.twilioAuthToken);
						await sendSmsInvitation({
							to: attendeeInput.phone,
							guestName: attendeeInput.name || 'Guest',
							hostName: userName,
							meetingTitle: body.title,
							meetingUrl,
							scheduledStart,
							twilioClient,
							fromNumber: config.twilioPhoneNumber,
						});
						inviteSent = true;
					} catch (smsError) {
						console.error('Failed to send SMS invitation:', smsError);
					}
				}
			} catch (attendeeError) {
				console.error('Failed to process attendee:', attendeeInput.email, attendeeError);
			}
		}

		// Update video meeting with invite_sent status
		if (inviteSent) {
			try {
				await directus.request(
					updateItem('video_meetings', videoMeeting.id, {
						invite_sent: true,
						invite_sent_at: new Date().toISOString(),
					}),
				);
			} catch (updateError) {
				console.error('Failed to update invite_sent status:', updateError);
			}
		}

		return {
			success: true,
			data: {
				meetingId: videoMeeting.id,
				appointmentId: appointment.id,
				roomName,
				roomSid: dailyRoom.id,
				meetingLink: meetingUrl,
				scheduledStart: scheduledStart.toISOString(),
				scheduledEnd: scheduledEnd.toISOString(),
				inviteSent,
			},
		};
	} catch (error) {
		const err = error as any;
		console.error('Error creating video room:', err);

		throw createError({
			statusCode: err.statusCode || 500,
			message: err.message || 'Failed to create video room',
		});
	}
});

// Helper function to send email invitation
async function sendEmailInvitation(params: {
	to: string;
	guestName: string;
	hostName: string;
	meetingTitle: string;
	meetingUrl: string;
	scheduledStart: Date;
	durationMinutes: number;
	org: OrgBrandRef | null;
	meetingId?: string | number | null;
}) {
	const { to, guestName, hostName, meetingTitle, meetingUrl, scheduledStart, durationMinutes, org, meetingId } = params;

	const formattedDate = scheduledStart.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	const formattedTime = scheduledStart.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZoneName: 'short',
	});

	const subject = `Video Meeting Invitation: ${meetingTitle}`;
	const heading = "You're invited to a video meeting";
	const bodyHtml = `
		<p style="margin:0 0 12px;">Hi ${escapeHtml(guestName)},</p>
		<p style="margin:0 0 12px;"><strong>${escapeHtml(hostName)}</strong> has invited you to a video meeting.</p>
		<div style="background:#f7f5f2;padding:16px 20px;border-radius:8px;margin:16px 0;">
			<p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#141210;">${escapeHtml(meetingTitle)}</p>
			<p style="margin:0 0 4px;font-size:14px;color:#444;"><strong>Date:</strong> ${escapeHtml(formattedDate)}</p>
			<p style="margin:0 0 4px;font-size:14px;color:#444;"><strong>Time:</strong> ${escapeHtml(formattedTime)}</p>
			<p style="margin:0;font-size:14px;color:#444;"><strong>Duration:</strong> ${durationMinutes} minutes</p>
		</div>
	`;
	const { html, text } = renderOrgEmail({
		org,
		subject,
		heading,
		bodyHtml,
		cta: { label: 'Join meeting', url: meetingUrl },
	});

	await sendBrandedEmail({
		to,
		subject,
		html,
		text,
		org,
		categories: ['transactional', 'video-invite'],
		sendCollection: 'video_meetings',
		sendId: meetingId ?? null,
	});
}

// Helper function to send SMS invitation
async function sendSmsInvitation(params: {
	to: string;
	guestName: string;
	hostName: string;
	meetingTitle: string;
	meetingUrl: string;
	scheduledStart: Date;
	twilioClient: any;
	fromNumber: string;
}) {
	const { to, guestName, hostName, meetingTitle, meetingUrl, scheduledStart, twilioClient, fromNumber } = params;

	const formattedDateTime = scheduledStart.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});

	const message = `Hi ${guestName}! ${hostName} invited you to "${meetingTitle}" on ${formattedDateTime}. Join here: ${meetingUrl}`;

	await twilioClient.messages.create({
		body: message,
		to,
		from: fromNumber,
	});
}
