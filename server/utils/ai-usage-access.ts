/**
 * Resolves how much AI-usage data the authenticated user may see in a given org.
 *
 * Two scopes:
 *   - 'all' — org-wide. Owners/admins, plus any role granted `ai_usage` read
 *     (managers by default). They see every member's usage, and may drill into
 *     a single member via `requestedUserId`.
 *   - 'own' — self only. Any other active member. Queries are hard-constrained
 *     to their own user id; a `requestedUserId` for someone else is ignored so
 *     a member can never read a colleague's usage by crafting the request.
 *
 * Non-members get 403. This mirrors `requireOrgPermission`'s membership +
 * permission-matrix logic (owner/admin bypass, stored perms with DEFAULT
 * fallback) but resolves a scope instead of throwing on missing permission.
 */
import { readItems } from '@directus/sdk';
import type { PermissionMatrix, RoleSlug } from '~~/shared/permissions';
import { DEFAULT_ROLE_PERMISSIONS } from '~~/shared/permissions';

export type AiUsageScope = 'all' | 'own';

export interface AiUsageAccess {
  /** The requesting user's id. */
  userId: string;
  roleSlug: RoleSlug;
  scope: AiUsageScope;
  /**
   * The user id every query must be constrained to, or `null` for org-wide.
   * 'own' → always the requester; 'all' → the drill-down target or null.
   */
  userFilter: string | null;
}

export async function resolveAiUsageAccess(
  event: any,
  organizationId: string,
  requestedUserId?: string | null,
): Promise<AiUsageAccess> {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id as string | undefined;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const directus = getTypedDirectus();
  const memberships = await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { user: { _eq: userId } },
          { organization: { _eq: organizationId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['id', 'role.slug', 'role.permissions'],
      limit: 1,
    }),
  ) as any[];

  const membership = memberships?.[0];
  if (!membership) {
    throw createError({ statusCode: 403, message: 'You are not a member of this organization' });
  }

  const roleSlug: RoleSlug | undefined = membership.role?.slug;
  if (!roleSlug) {
    throw createError({ statusCode: 403, message: 'Your membership has no assigned role' });
  }

  // Can this member view ALL members' usage, or only their own?
  let canViewAll = roleSlug === 'owner' || roleSlug === 'admin';
  if (!canViewAll) {
    const storedPerms = membership.role?.permissions as PermissionMatrix | null | undefined;
    const featurePerm =
      storedPerms && typeof storedPerms === 'object' && 'ai_usage' in storedPerms
        ? storedPerms['ai_usage']
        : DEFAULT_ROLE_PERMISSIONS[roleSlug]?.['ai_usage'];
    canViewAll = !!(featurePerm?.access && featurePerm.read);
  }

  const scope: AiUsageScope = canViewAll ? 'all' : 'own';
  const requested = requestedUserId?.trim() || null;
  const userFilter = scope === 'own' ? userId : requested;

  return { userId, roleSlug, scope, userFilter };
}
