/**
 * Shared server-side utility for checking org-level permissions.
 *
 * Authenticates the user, looks up their org_membership + role,
 * and checks `role.permissions[feature][action]` from the stored matrix.
 * Falls back to DEFAULT_ROLE_PERMISSIONS when a feature key is missing
 * (handles migration of new feature keys to existing orgs without data changes).
 */
import { readItems } from '@directus/sdk';
import type { CrudAction, FeatureKey, PermissionMatrix, RoleSlug } from '~~/shared/permissions';
import { DEFAULT_ROLE_PERMISSIONS } from '~~/shared/permissions';

export interface OrgPermissionResult {
  userId: string;
  membership: {
    id: string;
    roleSlug: RoleSlug;
    roleName: string;
  };
}

/**
 * Require that the authenticated user has a specific org-level permission.
 * Throws 401 if not authenticated, 403 if not authorised.
 * Returns the userId and membership info on success.
 */
export async function requireOrgPermission(
  event: any,
  organizationId: string,
  feature: FeatureKey,
  action: CrudAction,
): Promise<OrgPermissionResult> {
  // ── Authenticate ────────────────────────────────────────────────────────────
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id as string | undefined;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  // ── Look up membership + role ───────────────────────────────────────────────
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
      fields: ['id', 'role.slug', 'role.name', 'role.permissions'],
      limit: 1,
    }),
  ) as any[];

  const membership = memberships?.[0];
  if (!membership) {
    throw createError({ statusCode: 403, message: 'You are not a member of this organization' });
  }

  const roleSlug: RoleSlug | undefined = membership.role?.slug;
  const roleName: string = membership.role?.name || roleSlug || 'unknown';

  if (!roleSlug) {
    throw createError({ statusCode: 403, message: 'Your membership has no assigned role' });
  }

  // ── Owner / Admin bypass ────────────────────────────────────────────────────
  if (roleSlug === 'owner' || roleSlug === 'admin') {
    return {
      userId,
      membership: { id: membership.id, roleSlug, roleName },
    };
  }

  // ── Check stored permissions (with fallback) ────────────────────────────────
  const storedPerms = membership.role?.permissions as PermissionMatrix | null | undefined;
  let featurePerm;

  if (storedPerms && typeof storedPerms === 'object' && feature in storedPerms) {
    // Feature exists in stored permissions — use it
    featurePerm = storedPerms[feature];
  } else {
    // Feature key missing or permissions null — fall back to defaults
    const defaults = DEFAULT_ROLE_PERMISSIONS[roleSlug];
    featurePerm = defaults?.[feature];
  }

  if (!featurePerm?.access || !featurePerm[action]) {
    throw createError({
      statusCode: 403,
      message: `You do not have ${action} access to ${feature}`,
    });
  }

  return {
    userId,
    membership: { id: membership.id, roleSlug, roleName },
  };
}
