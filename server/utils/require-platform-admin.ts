// server/utils/require-platform-admin.ts
//
// Authorization gate for Earnest-internal (platform) operations — today that
// means granting/revoking wholesale pricing on an organization. "Platform
// admin" is deliberately NOT an org role: it maps to a Directus user whose
// role carries `admin_access` (the Directus super-admin flag). In practice
// that's only the internal Earnest staff (Peter + Camila).
//
// We read the CURRENT user's own record via `readMe` (the session token), so:
//   - it reflects live role state, not a possibly-stale session cookie, and
//   - it never touches the `directus_users` collection directly, which the
//     typed SDK guards against (readItem('directus_users') throws).
import type { H3Event } from 'h3';
import { directusGetMeFromSession } from '~~/server/utils/directus';

export interface PlatformAdmin {
	id: string;
	email: string | null;
	roleId: string | null;
	roleName: string | null;
}

/**
 * Throw 401 if unauthenticated, 403 if the caller is not a Directus
 * super-admin. Returns the resolved user on success.
 */
export async function requirePlatformAdmin(event: H3Event): Promise<PlatformAdmin> {
	let me: any;
	try {
		me = await directusGetMeFromSession(event);
	} catch {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	if (!me?.id) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	if (!me?.role?.admin_access) {
		throw createError({
			statusCode: 403,
			message: 'Platform admin access required',
		});
	}

	return {
		id: me.id,
		email: me.email ?? null,
		roleId: me.role?.id ?? null,
		roleName: me.role?.name ?? null,
	};
}
