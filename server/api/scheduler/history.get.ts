// server/api/scheduler/history.get.ts
import { createDirectus, rest, readItems, authentication } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	
	const client = createDirectus(config.public.directusUrl)
		.with(authentication())
		.with(rest());

	try {
		const session = await getUserSession(event);
		const accessToken = session?.user?.access_token || session?.secure?.access_token;

		if (accessToken) {
			await client.setToken(accessToken);
		}

		// Get video meetings history
		const videoMeetings = await client.request(
			readItems('video_meetings', {
				fields: [
					'id',
					'title',
					'meeting_type',
					'status',
					'scheduled_start',
					'scheduled_end',
					'actual_start',
					'actual_end',
					'actual_duration_minutes',
					'duration_minutes',
					'invitee_name',
					'invitee_email',
					'participant_count',
					'room_name',
					'date_created',
				],
				filter: {
					status: { _in: ['completed', 'cancelled', 'no_show'] },
				},
				sort: ['-scheduled_start'],
				limit: 500,
			})
		);

		// Get appointments history
		const appointments = await client.request(
			readItems('appointments', {
				fields: [
					'id',
					'title',
					'status',
					'start_time',
					'end_time',
					'is_video',
					'date_created',
				],
				filter: {
					_or: [
						{ status: { _in: ['completed', 'canceled'] } },
						{ start_time: { _lt: new Date().toISOString() } },
					],
				},
				sort: ['-start_time'],
				limit: 500,
			})
		);

		// Merge and format
		const history = [
			...videoMeetings.map((vm: any) => ({
				...vm,
				type: 'video',
				start_time: vm.scheduled_start,
			})),
			...appointments
				.filter((a: any) => !a.is_video)
				.map((a: any) => ({
					...a,
					type: 'appointment',
				})),
		].sort((a, b) => new Date(b.start_time || b.scheduled_start).getTime() - new Date(a.start_time || a.scheduled_start).getTime());

		return { data: history };
	} catch (error: any) {
		console.error('Error fetching history:', error);
		throw createError({
			statusCode: error.status || 500,
			message: error.message || 'Failed to fetch history',
		});
	}
});
