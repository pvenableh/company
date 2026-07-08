// server/api/org/add-member.post.ts
/**
 * Add an EXISTING Directus user to an organization with an org role.
 *
 * Unlike invite-member.post.ts this sends no email and creates no user — it is
 * for the "add an existing account to this org" admin flow. It fixes the bug
 * where the client-side addUserToOrganization only wrote the legacy
 * `organizations_directus_users` junction and NO `org_memberships` row, leaving
 * the added user with no org role (and therefore no permissions).
 *
 * Body: { organizationId, userId, roleSlug? }  (roleSlug defaults to 'member')
 *
 * Flow:
 * 1. Requester must be an active owner/admin of the org.
 * 2. Resolve the org's role by slug (org_roles is per-org — IDs differ per org).
 * 3. If an org_membership already exists, reactivate it (idempotent); else create active.
 * 4. Upsert the legacy junction row for backward compat.
 */

import { createItem, readItems, updateItem, readUser } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const { organizationId, userId } = body;
	const roleSlug = body.roleSlug || 'member';

	if (!organizationId || !userId) {
		throw createError({
			statusCode: 400,
			message: 'organizationId and userId are required',
		});
	}

	const directus = getServerDirectus();

	// ── Auth: requester must be an active owner/admin of this org ──────────────
	const session = await getUserSession(event);
	const currentUserId = session?.user?.id;
	if (!currentUserId) {
		throw createError({ statusCode: 401, message: 'Not authenticated' });
	}

	const requesterMembership = (await directus.request(
		readItems('org_memberships', {
			filter: {
				organization: { _eq: organizationId },
				user: { _eq: currentUserId },
				status: { _eq: 'active' },
			},
			fields: ['id', 'role.slug'],
			limit: 1,
		}),
	)) as any[];

	const requesterRole = requesterMembership[0]?.role?.slug;
	if (!requesterRole || !['owner', 'admin'].includes(requesterRole)) {
		throw createError({
			statusCode: 403,
			message: 'Only owners and admins can add members',
		});
	}

	// ── Resolve the target role for this org ───────────────────────────────────
	if (roleSlug === 'owner') {
		throw createError({
			statusCode: 400,
			message: 'Cannot add someone as owner. Transfer ownership instead.',
		});
	}

	const matchedRole = (await directus.request(
		readItems('org_roles', {
			filter: {
				organization: { _eq: organizationId },
				slug: { _eq: roleSlug },
			},
			fields: ['id', 'slug', 'name'],
			limit: 1,
		}),
	)) as any[];

	if (!matchedRole.length) {
		throw createError({
			statusCode: 400,
			message: `No '${roleSlug}' role found in this organization`,
		});
	}
	const roleId = matchedRole[0].id;

	// Confirm the target user exists.
	const targetUser = (await directus
		.request(readUser(userId, { fields: ['id', 'email', 'first_name', 'last_name'] as any }))
		.catch(() => null)) as any;
	if (!targetUser) {
		throw createError({ statusCode: 404, message: 'User not found' });
	}

	// ── Create or reactivate the org_membership (idempotent) ──────────────────
	const existingMembership = (await directus.request(
		readItems('org_memberships', {
			filter: {
				organization: { _eq: organizationId },
				user: { _eq: userId },
			},
			fields: ['id', 'status'],
			limit: 1,
		}),
	)) as any[];

	let membership: any;
	if (existingMembership.length) {
		membership = await directus.request(
			updateItem('org_memberships', existingMembership[0].id, {
				role: roleId,
				status: 'active',
			}),
		);
	} else {
		membership = await directus.request(
			createItem('org_memberships', {
				organization: organizationId,
				user: userId,
				role: roleId,
				status: 'active',
				invited_by: currentUserId,
				invited_at: new Date().toISOString(),
			}),
		);
	}

	// ── Upsert legacy junction for backward compat (non-fatal) ────────────────
	try {
		const existingJunction = (await directus.request(
			readItems('organizations_directus_users', {
				filter: {
					organizations_id: { _eq: organizationId },
					directus_users_id: { _eq: userId },
				},
				fields: ['id'],
				limit: 1,
			}),
		)) as any[];

		if (!existingJunction.length) {
			await directus.request(
				createItem('organizations_directus_users', {
					organizations_id: organizationId,
					directus_users_id: userId,
				}),
			);
		}
	} catch (junctionErr: any) {
		console.warn('Legacy junction create failed (non-fatal):', junctionErr?.message);
	}

	return {
		success: true,
		message: `${targetUser.email || 'User'} added to the organization.`,
		membershipId: membership?.id ?? null,
	};
});
