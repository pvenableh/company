// GET /api/video/meetings/:id/snapshot-image?file=<fileId>
// Streams a snapshot image to authorized meeting viewers. Snapshot files are
// private (meeting content), so rather than expose raw /assets/ URLs we proxy
// the bytes through the admin token after confirming (a) the caller can access
// the meeting and (b) the requested file actually belongs to a snapshot on
// this meeting — so the param can't be used to read arbitrary files.

import { readItems } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	await requireMeetingAccess(event, meetingId);

	const fileId = getQuery(event).file as string | undefined;
	if (!fileId) {
		throw createError({ statusCode: 400, message: 'file is required' });
	}

	const directus = getTypedDirectus();
	const rows = await directus.request(
		readItems('meeting_snapshots', {
			filter: { meeting: { _eq: meetingId }, image: { _eq: fileId } },
			fields: ['id'] as any,
			limit: 1,
		}),
	);
	if (!rows?.length) {
		throw createError({ statusCode: 404, message: 'Snapshot not found' });
	}

	const config = useRuntimeConfig();
	const directusUrl = config.directus?.url || config.public.directusUrl;
	const token = config.directus?.serverToken;

	const res = await fetch(`${directusUrl}/assets/${fileId}`, {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
	if (!res.ok) {
		throw createError({ statusCode: 502, message: 'Could not load snapshot image' });
	}

	setHeader(event, 'Content-Type', res.headers.get('content-type') || 'image/png');
	setHeader(event, 'Cache-Control', 'private, max-age=300');
	return Buffer.from(await res.arrayBuffer());
});
