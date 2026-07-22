// server/utils/platform.ts
/**
 * Platform-owner gating.
 *
 * The "Earnest creator" is any user whose GLOBAL Directus role is Administrator
 * (admin_access). Gating cross-org surfaces to this role grants no new access —
 * those users can already read every org via admin.earnest.guru — so a platform
 * console is safe by construction, with no extra flag/env to manage.
 */
const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';

export async function isPlatformAdmin(event: any): Promise<boolean> {
  const session = await getUserSession(event);
  const role = (session as any)?.user?.role;
  const roleId = typeof role === 'object' ? role?.id : role;
  return roleId === ADMIN_ROLE_ID;
}

export async function requirePlatformAdmin(event: any): Promise<void> {
  if (!(await isPlatformAdmin(event))) {
    throw createError({ statusCode: 403, message: 'Platform access only' });
  }
}

/**
 * Authorize a per-org read: allow if the caller is a platform admin (any org)
 * OR an active manager/admin/owner member of the requested org. Throws 401/403.
 * Returns the caller's user id.
 */
export async function authorizeOrgInsight(event: any, orgId: string): Promise<string> {
  const session = await getUserSession(event);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });
  if (!orgId) throw createError({ statusCode: 400, message: 'org is required' });

  if (await isPlatformAdmin(event)) return userId;

  const { readItems } = await import('@directus/sdk');
  const rows = (await withTransientRetry(() => getServerDirectus().request(
    readItems('org_memberships', {
      filter: {
        user: { _eq: userId },
        organization: { _eq: orgId },
        status: { _eq: 'active' },
        role: { slug: { _in: ['owner', 'admin', 'manager'] } },
      },
      fields: ['id'],
      limit: 1,
    }),
  ), { label: 'authorizeOrgInsight' })) as Array<{ id: string }>;

  if (!rows.length) {
    throw createError({ statusCode: 403, message: 'You are not a manager of this organization' });
  }
  return userId;
}
