// PATCH /api/admin/organizations/[id]/wholesale
//
// Earnest platform-admin control to grant or revoke wholesale pricing on an
// organization. Gated by `requirePlatformAdmin` (Directus super-admin only —
// today just internal Earnest staff). An org can NEVER grant this to itself;
// there is deliberately no org-role path to this endpoint.
//
// Body: { enabled: boolean }
import { readItem, updateItem } from '@directus/sdk';
import { requirePlatformAdmin } from '~~/server/utils/require-platform-admin';

export default defineEventHandler(async (event) => {
	const admin = await requirePlatformAdmin(event);

	const orgId = getRouterParam(event, 'id');
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'organization id is required' });
	}

	const body = await readBody<{ enabled?: boolean }>(event);
	if (typeof body?.enabled !== 'boolean') {
		throw createError({ statusCode: 400, message: 'enabled (boolean) is required' });
	}

	const directus = getTypedDirectus();

	const org = (await directus
		.request(readItem('organizations', orgId, { fields: ['id', 'name', 'wholesale_pricing'] }))
		.catch(() => null)) as { id: string; name?: string | null; wholesale_pricing?: boolean } | null;

	if (!org) {
		throw createError({ statusCode: 404, message: 'Organization not found' });
	}

	await directus.request(
		updateItem('organizations', orgId, { wholesale_pricing: body.enabled }),
	);

	console.log(
		`[admin/wholesale] ${admin.email || admin.id} set wholesale_pricing=${body.enabled} on org ${orgId} (${org.name || 'unnamed'})`,
	);

	return {
		id: orgId,
		name: org.name ?? null,
		wholesale_pricing: body.enabled,
	};
});
