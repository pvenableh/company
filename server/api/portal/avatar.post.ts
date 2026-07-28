/**
 * Portal avatar upload (server-proxied).
 *
 * Portal client users are a read-mostly Directus role WITHOUT `directus_files`
 * create permission, so they can't upload straight to Directus /files the way
 * staff do. This endpoint proxies the upload with the service token, drops the
 * image into the organization's "Avatars" subfolder (created on first use), and
 * sets it as the CURRENT portal user's avatar — scoped to their own id, blocked
 * in staff "Preview as client" mode.
 *
 * They can already PATCH their own `avatar` field (see the Client Portal policy
 * self-update grant); this only covers the file upload they otherwise can't do.
 */
import { readFolders, createFolder, uploadFiles, updateUser, readItems } from '@directus/sdk';
import { requirePortalContext, assertNotPreview } from '~~/server/utils/portal-auth';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export default defineEventHandler(async (event) => {
	const ctx = await requirePortalContext(event);
	assertNotPreview(ctx); // don't let a staff preview edit the client's avatar

	const session = await getUserSession(event);
	const userId = (session as any)?.user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Not authenticated' });

	const parts = await readMultipartFormData(event);
	const filePart = parts?.find((p) => p.name === 'file' && p.filename);
	if (!filePart?.data?.length) throw createError({ statusCode: 400, message: 'No file provided' });

	const type = (filePart.type || '').toLowerCase();
	if (!ALLOWED.has(type)) {
		throw createError({ statusCode: 415, message: 'Avatar must be a PNG, JPEG, WebP, or GIF image.' });
	}
	if (filePart.data.length > MAX_BYTES) {
		throw createError({ statusCode: 413, message: 'Image is too large (max 8MB).' });
	}

	const directus = getServerDirectus();

	// Resolve the org's root folder, then find-or-create its "Avatars" subfolder.
	let targetFolder: string | null = null;
	try {
		const orgs = (await directus.request(
			readItems('organizations', { filter: { id: { _eq: ctx.organizationId } }, fields: ['id', 'folder'], limit: 1 }),
		)) as any[];
		const rootFolder = orgs?.[0]?.folder || null;
		if (rootFolder) {
			const existing = (await directus.request(
				readFolders({ filter: { parent: { _eq: rootFolder }, name: { _eq: 'Avatars' } }, fields: ['id'], limit: 1 }),
			)) as any[];
			targetFolder = existing?.[0]?.id
				?? (await directus.request(createFolder({ name: 'Avatars', parent: rootFolder })) as any)?.id
				?? null;
		}
	} catch (folderErr: any) {
		// Non-fatal — fall back to no folder so the upload still succeeds.
		console.warn('[portal/avatar] folder resolution failed:', folderErr?.message || folderErr);
	}

	// Upload with the service token (portal role can't create files itself).
	const form = new FormData();
	if (targetFolder) form.append('folder', targetFolder);
	form.append('title', `Avatar — ${(session as any)?.user?.email || userId}`);
	form.append('file', new Blob([filePart.data], { type }), filePart.filename);

	let fileId: string | null = null;
	try {
		const uploaded = (await directus.request(uploadFiles(form))) as any;
		fileId = uploaded?.id ?? null;
	} catch (uploadErr: any) {
		console.error('[portal/avatar] upload failed:', uploadErr?.message || uploadErr);
		throw createError({ statusCode: 502, message: 'Could not upload your image. Please try again.' });
	}
	if (!fileId) throw createError({ statusCode: 502, message: 'Upload returned no file id.' });

	// Set the avatar on the CURRENT user only.
	await directus.request(updateUser(userId, { avatar: fileId } as any));

	return { fileId };
});
