// POST /api/video/meetings/:id/snapshots
// Host-only. Upload a composited frame snapshot (screen share + annotation
// marks, captured client-side) and attach it to the meeting.
//
// Server-routed on the admin token for the same reason as notes/chat: Directus
// 11 doesn't enforce FK-walked filters on the create action, so we gate on
// host-ownership in code and write through the admin client.

import { createItem, readItem, readItems, uploadFiles } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

/**
 * Resolve (and lazily create) the per-org "Meetings" subfolder so snapshot
 * files stay organised under the organisation's root folder — mirroring the
 * Clients/Financials/Uploads convention set up in server/api/org/create.post.ts.
 * Returns null (→ upload to the unfiled root) if the org has no folder yet.
 */
async function resolveOrgMeetingsFolder(directus: any, organizationId: string | null): Promise<string | null> {
	if (!organizationId) return null;
	try {
		const org = (await directus.request(
			readItem('organizations', organizationId, { fields: ['folder'] as any }),
		)) as { folder?: { id: string } | string | null } | null;
		const rootId = typeof org?.folder === 'object' ? org?.folder?.id : org?.folder;
		if (!rootId) return null;

		const existing = (await directus.request(
			readItems('directus_folders', {
				filter: { name: { _eq: 'Meetings' }, parent: { _eq: rootId } },
				fields: ['id'] as any,
				limit: 1,
			}),
		)) as Array<{ id: string }>;
		if (existing?.length) return existing[0]!.id;

		const created = (await directus.request(
			createItem('directus_folders', { name: 'Meetings', parent: rootId } as any),
		)) as { id: string };
		return created?.id || null;
	} catch (err: any) {
		// Folder organisation is best-effort — never block a snapshot on it.
		console.warn('[snapshots] org folder resolve failed:', err?.message);
		return null;
	}
}

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	const { userId, isHost, organizationId } = await requireMeetingAccess(event, meetingId);
	if (!isHost) {
		throw createError({ statusCode: 403, message: 'Only the meeting host can capture snapshots' });
	}

	const form = await readMultipartFormData(event);
	if (!form) {
		throw createError({ statusCode: 400, message: 'No form data provided' });
	}

	const filePart = form.find((p) => p.name === 'file');
	if (!filePart?.data?.length) {
		throw createError({ statusCode: 400, message: 'No snapshot file provided' });
	}

	const fieldStr = (name: string) => {
		const part = form.find((p) => p.name === name);
		return part?.data ? part.data.toString().trim() : '';
	};
	const caption = fieldStr('caption') || null;
	const offsetRaw = fieldStr('meeting_offset_seconds');
	const meetingOffsetSeconds = offsetRaw && !Number.isNaN(Number(offsetRaw))
		? Math.max(0, Math.floor(Number(offsetRaw)))
		: null;

	const directus = getTypedDirectus();

	// Keep snapshot files tidy under the org's "Meetings" subfolder.
	const folderId = await resolveOrgMeetingsFolder(directus, organizationId);

	// Upload the PNG to directus_files. Directus reads `folder` from the
	// multipart body, so it must be appended BEFORE the file part.
	const uploadForm = new FormData();
	uploadForm.append('title', `Meeting snapshot ${new Date().toISOString()}`);
	if (folderId) uploadForm.append('folder', folderId);
	const blob = new Blob([new Uint8Array(filePart.data)], { type: filePart.type || 'image/png' });
	uploadForm.append('file', blob, filePart.filename || 'snapshot.png');
	const uploaded = (await directus.request(uploadFiles(uploadForm))) as { id: string };

	const created = await directus.request(
		createItem('meeting_snapshots', {
			meeting: meetingId,
			author: userId,
			image: uploaded.id,
			caption,
			meeting_offset_seconds: meetingOffsetSeconds,
		} as any),
	);

	const snapshot = await directus.request(
		readItem('meeting_snapshots', (created as any).id, {
			fields: [
				'id',
				'caption',
				'meeting_offset_seconds',
				'date_created',
				'image.id',
				'image.filename_download',
				'author.id',
				'author.first_name',
				'author.last_name',
			] as any,
		}),
	);

	return { data: snapshot };
});
