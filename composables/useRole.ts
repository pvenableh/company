/**
 * useRole - Shared role-checking utilities
 *
 * Handles the fact that user.role may be either a string ID or
 * an object { id, name } depending on context (login returns an object).
 */

export function useRole() {
  const config = useRuntimeConfig();

  const ADMIN_ROLE_ID = config.public.adminRole || config.public.adminRoleId || '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
  const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb';

  /**
   * Extract the role ID string from a user object.
   * Handles both string and object { id, name } formats.
   */
  function getRoleId(user: any): string | null {
    if (!user) return null;
    const role = user.role;
    if (!role) return null;
    if (typeof role === 'object') return role.id ?? null;
    return role;
  }

  /**
   * Check if a user has the admin role.
   */
  function isAdmin(user: any): boolean {
    return getRoleId(user) === ADMIN_ROLE_ID;
  }

  /**
   * Check if a user has admin or client-manager access.
   */
  function hasAdminAccess(user: any): boolean {
    const roleId = getRoleId(user);
    return roleId === ADMIN_ROLE_ID || roleId === CLIENT_MANAGER_ROLE_ID;
  }

  /**
   * Check if a user has a specific role.
   */
  function hasRole(user: any, roleId: string): boolean {
    return getRoleId(user) === roleId;
  }

  return {
    ADMIN_ROLE_ID,
    CLIENT_MANAGER_ROLE_ID,
    getRoleId,
    isAdmin,
    hasAdminAccess,
    hasRole,
  };
}
