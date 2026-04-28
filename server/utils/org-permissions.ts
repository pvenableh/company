/**
 * Shared server-side utility for checking org-level permissions.
 *
 * Authenticates the user, looks up their org_membership + role,
 * and checks `role.permissions[feature][action]` from the stored matrix.
 * Falls back to DEFAULT_ROLE_PERMISSIONS when a feature key is missing
 * (handles migration of new feature keys to existing orgs without data changes).
 */
import { readItem, readItems } from '@directus/sdk';
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

/**
 * Emails that belong to the shared demo workspaces. These accounts are
 * public — anyone can sign in by clicking /try-demo — so they must never
 * hit coarse-grained role checks like the Stripe subscription routes,
 * regardless of what role they carry inside the demo org.
 */
const DEMO_USER_EMAILS = new Set<string>(
  [
    process.env.DEMO_USER_EMAIL || 'demo@earnest.guru',
    process.env.DEMO_AGENCY_USER_EMAIL || 'demo-agency@earnest.guru',
  ].map((e) => e.toLowerCase()),
);

/**
 * Require that the authenticated user has at least one active org_membership
 * whose role.slug is in `allowed`. Used as a coarse gate for endpoints that
 * aren't org-scoped in their body (e.g. Stripe billing routes operate on a
 * stripe customer id, not an orgId). Throws 401/403 on failure.
 *
 * Demo-workspace logins are hard-blocked here — the solo demo is Member
 * so wouldn't pass anyway, but the agency demo is Admin and would otherwise
 * sail through the role check even though it's a shared public account.
 */
export async function requireOrgRole(
  event: any,
  allowed: RoleSlug[],
): Promise<{ userId: string; roleSlug: RoleSlug }> {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id as string | undefined;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const userEmail = ((session as any).user?.email as string | undefined)?.toLowerCase();
  if (userEmail && DEMO_USER_EMAILS.has(userEmail)) {
    throw createError({
      statusCode: 403,
      message: 'Demo accounts cannot perform billing or destructive org actions.',
    });
  }

  const directus = getTypedDirectus();
  const memberships = await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { user: { _eq: userId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['id', 'role.slug'],
      limit: 50,
    }),
  ) as any[];

  const match = memberships.find((m: any) => allowed.includes(m?.role?.slug as RoleSlug));
  if (!match) {
    throw createError({
      statusCode: 403,
      message: 'You do not have permission to perform this action',
    });
  }
  return { userId, roleSlug: match.role.slug as RoleSlug };
}

/**
 * Require that the target organization is not archived. Throws 410 (Gone) when
 * archived so client code can detect "this org's lifecycle has ended" cleanly
 * (vs. 403 which means "you can't"). Use on every mutating route that operates
 * inside an org context — archive/restore are exempt by design.
 *
 * Returns the organization row so the caller can avoid a duplicate lookup.
 */
export async function requireActiveOrg(orgId: string): Promise<{ id: string; archived_at: string | null }> {
  if (!orgId) {
    throw createError({ statusCode: 400, message: 'Organization id is required' });
  }
  const directus = getTypedDirectus();
  const org = await directus.request(
    readItem('organizations', orgId, { fields: ['id', 'archived_at'] }),
  ).catch(() => null) as { id: string; archived_at: string | null } | null;

  if (!org) {
    throw createError({ statusCode: 404, message: 'Organization not found' });
  }
  if (org.archived_at) {
    throw createError({
      statusCode: 410,
      message: 'This organization is archived. Restore it before making changes.',
      data: { archived_at: org.archived_at },
    });
  }
  return org;
}
