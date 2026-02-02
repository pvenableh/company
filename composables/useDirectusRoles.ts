// composables/useDirectusRoles.ts
/**
 * useDirectusRoles - Role management composable
 *
 * Handles role queries and management using Directus SDK methods
 * Provides both CRUD operations and helper functions for role checks
 *
 * Usage:
 * const { list, get, isAdminRole } = useDirectusRoles()
 */

export interface DirectusRole {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  app_access: boolean;
  admin_access: boolean;
}

export function useDirectusRoles() {
  const items = useDirectusItems<DirectusRole>("directus_roles");

  /**
   * List all roles with optional filtering
   */
  async function list(query?: {
    filter?: Record<string, any>;
    fields?: string[];
    sort?: string[];
    limit?: number;
  }): Promise<DirectusRole[]> {
    return await items.list(query);
  }

  /**
   * Get single role by ID
   */
  async function get(
    id: string,
    query?: { fields?: string[] }
  ): Promise<DirectusRole> {
    return await items.get(id, query);
  }

  /**
   * Get role by name
   */
  async function getByName(name: string): Promise<DirectusRole | null> {
    const roles = await list({
      filter: { name: { _eq: name } },
      limit: 1,
    });
    return roles[0] || null;
  }

  /**
   * Check if a role ID is an admin role
   */
  async function isAdminRole(roleId: string): Promise<boolean> {
    const role = await get(roleId);
    return role?.admin_access === true;
  }

  /**
   * Get all non-admin roles (for user assignment)
   */
  async function getNonAdminRoles(): Promise<DirectusRole[]> {
    return await list({
      filter: { admin_access: { _eq: false } },
    });
  }

  return {
    list,
    get,
    getByName,
    isAdminRole,
    getNonAdminRoles,
  };
}
