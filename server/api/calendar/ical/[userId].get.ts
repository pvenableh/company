// server/api/calendar/ical/[userId].get.ts
// Read-only iCal (.ics) feed for subscribing from external calendar apps.
// URL: /api/calendar/ical/{userId}?token={feedToken}

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const userId = getRouterParam(event, 'userId');
	const query = getQuery(event);
	const token = query.token as string;

	if (!userId || !token) {
		throw createError({ statusCode: 400, message: 'Missing userId or token' });
	}

	const directus = getPublicDirectus();

	// Validate feed token against scheduler_settings
	const adminDirectus = getTypedDirectus();
	let settings: any;
	try {
		const results = await adminDirectus.request(
			readItems('scheduler_settings', {
				filter: { user: { _eq: userId }, ical_feed_token: { _eq: token } },
				limit: 1,
			}),
		);
		settings = results?.[0];
	} catch {
		throw createError({ statusCode: 401, message: 'Invalid feed token' });
	}

	if (!settings) {
		throw createError({ statusCode: 401, message: 'Invalid feed token' });
	}

	// Fetch appointments for this user (30 days ago to 90 days ahead)
	const now = new Date();
	const rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const rangeEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

	let appointments: any[] = [];
	try {
		appointments = await adminDirectus.request(
			readItems('appointments', {
				fields: ['id', 'title', 'description', 'start_time', 'end_time', 'status', 'is_video', 'meeting_link', 'room_name'],
				filter: {
					user_created: { _eq: userId },
					start_time: { _gte: rangeStart.toISOString(), _lte: rangeEnd.toISOString() },
				},
				sort: ['start_time'],
				limit: 500,
			}),
		);
	} catch (e) {
		console.error('Failed to fetch appointments for iCal feed:', e);
	}

	// Build iCal output
	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Earnest//Calendar Feed//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:Earnest Calendar`,
	];

	for (const apt of appointments) {
		if (!apt.start_time) continue;

		const uid = `apt-${apt.id}@earnest`;
		const dtStart = toICalDate(apt.start_time);
		const dtEnd = apt.end_time ? toICalDate(apt.end_time) : dtStart;
		const summary = escapeICalText(apt.title || 'Untitled');
		const description = escapeICalText(apt.description || '');
		const location = apt.is_video && apt.meeting_link ? escapeICalText(apt.meeting_link) : '';
		const status = apt.status === 'canceled' ? 'CANCELLED' : apt.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE';

		lines.push('BEGIN:VEVENT');
		lines.push(`UID:${uid}`);
		lines.push(`DTSTART:${dtStart}`);
		lines.push(`DTEND:${dtEnd}`);
		lines.push(`SUMMARY:${summary}`);
		if (description) lines.push(`DESCRIPTION:${description}`);
		if (location) lines.push(`LOCATION:${location}`);
		lines.push(`STATUS:${status}`);
		lines.push(`DTSTAMP:${toICalDate(new Date().toISOString())}`);
		lines.push('END:VEVENT');
	}

	lines.push('END:VCALENDAR');

	const icalContent = lines.join('\r\n');

	setResponseHeaders(event, {
		'Content-Type': 'text/calendar; charset=utf-8',
		'Content-Disposition': 'inline; filename="earnest-calendar.ics"',
		'Cache-Control': 'no-cache, no-store, must-revalidate',
	});

	return icalContent;
});

function toICalDate(isoStr: string): string {
	// Convert ISO date to iCal format: 20260330T140000Z
	const d = new Date(isoStr);
	return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICalText(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
