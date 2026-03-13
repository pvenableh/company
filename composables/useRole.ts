/**
 * useRole - Shared role-checking utilities
 *
 * All role and permission checks now delegate to `useOrgRole()` which
 * manages per-org memberships. The Directus global role fallback has been
 * removed — all authorization flows through org_memberships.
 *
 * The legacy constants (ADMIN_ROLE_ID, CLIENT_MANAGER_ROLE_ID) and
 * helper functions (getRoleId, hasRole) are kept for backward compat
 * with components that still reference them (e.g. TeamsManageTeams,
 * TicketsDetailsForm). These should be migrated to canAccess/hasPermission.
 *
 * The `user` param on isAdmin/hasAdminAccess is kept for call-site compat
 * but is no longer used — role is determined by org membership.
 */

import type { FeatureKey, CrudAction } from '~/types/permissions';

export function useRole() {
  const config = useRuntimeConfig();

  // ── Deprecated constants ─────────────────────────────────────────────────
  // Kept as exports for backward compat. New code should use canAccess/hasPermission.
  /** @deprecated Use canAccess/hasPermission instead */
  const ADMIN_ROLE_ID = config.public.adminRole || config.public.adminRoleId || '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
  /** @deprecated Use canAccess/hasPermission instead */
  const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb';

  // Per-org role composable — the source of truth for all permission checks
  const {
    isOrgOwner,
    isOrgAdmin,
    isOrgManagerOrAbove,
    isOrgAdminOrAbove,
    hasMembership,
    isOrgClient,
    canAccess: orgCanAccess,
    hasPermission: orgHasPermission,
    canView: orgCanView,
    canCreate: orgCanCreate,
    canEdit: orgCanEdit,
    canDelete: orgCanDelete,
  } = useOrgRole();

  /**
   * Extract the role ID string from a user object.
   * @deprecated Use canAccess/hasPermission for authorization checks
   */
  function getRoleId(user: any): string | null {
    if (!user) return null;
    const role = user.role;
    if (!role) return null;
    if (typeof role === 'object') return role.id ?? null;
    return role;
  }

  /**
   * Check if a user has admin-level access.
   * Now fully delegates to useOrgRole() — no Directus role fallback.
   */
  function isAdmin(_user?: any): boolean {
    return isOrgAdminOrAbove.value;
  }

  /**
   * Check if a user has admin or manager access.
   * Now fully delegates to useOrgRole() — no Directus role fallback.
   */
  function hasAdminAccess(_user?: any): boolean {
    return isOrgManagerOrAbove.value;
  }

  /**
   * Check if a user has a specific Directus role.
   * @deprecated Use canAccess/hasPermission for authorization checks
   */
  function hasRole(user: any, roleId: string): boolean {
    return getRoleId(user) === roleId;
  }

  // ── Permission-aware checks (primary API) ────────────────────────────────

  /** Check if the current user can access a feature */
  function canAccess(feature: FeatureKey): boolean {
    return orgCanAccess(feature);
  }

  /** Check a specific CRUD action on a feature */
  function hasPermission(feature: FeatureKey, action: CrudAction): boolean {
    return orgHasPermission(feature, action);
  }

  /** Can the user view a feature? */
  function canView(feature: FeatureKey): boolean {
    return orgCanView(feature);
  }

  /** Can the user create items in a feature? */
  function canCreate(feature: FeatureKey): boolean {
    return orgCanCreate(feature);
  }

  /** Can the user edit items in a feature? */
  function canEdit(feature: FeatureKey): boolean {
    return orgCanEdit(feature);
  }

  /** Can the user delete items in a feature? */
  function canDelete(feature: FeatureKey): boolean {
    return orgCanDelete(feature);
  }

  return {
    // Deprecated constants (kept for backward compat)
    ADMIN_ROLE_ID,
    CLIENT_MANAGER_ROLE_ID,

    // Deprecated legacy role checks
    getRoleId,
    isAdmin,
    hasAdminAccess,
    hasRole,

    // Primary permission API
    canAccess,
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
  };
}
