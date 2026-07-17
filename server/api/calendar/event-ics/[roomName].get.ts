// server/api/calendar/event-ics/[roomName].get.ts
//
// Per-meeting iCalendar (.ics) download — powers the "Add to calendar" button in
// the video-invite email. Public-safe: keyed by the meeting's unguessable random
// room_name (same secrecy model as the join link). Returns a single VEVENT the
// recipient's calendar app saves with a prompt (Apple Calendar / Outlook / Google
// all consume text/calendar).
import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';

function icsEscape(v: string): string {
	return String(v || '')
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

// UTC basic format: 20260720T183000Z
function toIcsUtc(d: Date): string {
	return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Fold lines at 75 octets per RFC 5545 (continuation lines start with a space).
function fold(line: string): string {
	if (line.length <= 73) return line;
	const out: string[] = [];
	let rest = line;
	while (rest.length > 73) {
		out.push(rest.slice(0, 73));
		rest = ' ' + rest.slice(73);
	}
	out.push(rest);
	return out.join('\r\n');
}

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const roomName = getRouterParam(event, 'roomName');
	if (!roomName) throw createError({ statusCode: 400, message: 'roomName is required' });

	const directusUrl = config.public.directusUrl;
	const token = config.directusServerToken as string;
	if (!directusUrl || !token) throw createError({ statusCode: 500, message: 'Calendar service not configured' });

	const client = createDirectus(directusUrl).with(rest()).with(staticToken(token));
	const rows = (await client.request(
		readItems('video_meetings', {
			filter: { room_name: { _eq: roomName } },
			fields: ['id', 'title', 'description', 'scheduled_start', 'scheduled_end', 'duration_minutes', 'meeting_url', 'host_identity', 'invitee_name'],
			limit: 1,
		}),
	).catch(() => [])) as any[];

	const m = rows[0];
	if (!m) throw createError({ statusCode: 404, message: 'Meeting not found' });

	const start = m.scheduled_start ? new Date(m.scheduled_start) : null;
	if (!start || isNaN(start.getTime())) throw createError({ statusCode: 404, message: 'Meeting has no start time' });
	const end = m.scheduled_end && !isNaN(new Date(m.scheduled_end).getTime())
		? new Date(m.scheduled_end)
		: new Date(start.getTime() + (Number(m.duration_minutes) || 30) * 60000);

	const joinUrl = m.meeting_url || `${config.public.siteUrl}/meeting/${roomName}`;
	const title = m.title || 'Video meeting';
	const descParts = [m.description || '', `Join: ${joinUrl}`].filter(Boolean);

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Earnest//Scheduler//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${icsEscape(roomName)}@earnest.guru`,
		`DTSTAMP:${toIcsUtc(new Date())}`,
		`DTSTART:${toIcsUtc(start)}`,
		`DTEND:${toIcsUtc(end)}`,
		`SUMMARY:${icsEscape(title)}`,
		`DESCRIPTION:${icsEscape(descParts.join('\n\n'))}`,
		`LOCATION:${icsEscape(joinUrl)}`,
		`URL:${icsEscape(joinUrl)}`,
		'STATUS:CONFIRMED',
		'END:VEVENT',
		'END:VCALENDAR',
	].map(fold).join('\r\n');

	setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8');
	setHeader(event, 'Content-Disposition', `attachment; filename="${roomName}.ics"`);
	setHeader(event, 'Cache-Control', 'private, max-age=0, no-store');
	return lines;
});
