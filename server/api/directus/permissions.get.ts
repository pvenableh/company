// server/api/directus/permissions.get.ts
/**
 * Server endpoint to query Directus permissions for the current user's role.
 * Returns field-level and collection-level permissions for conditional UI rendering.
 *
 * Query params:
 * - collection (optional): Filter to a specific collection
 */

import { readPermissions, readMe } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);
    if (!session?.user) {
      throw createError({
        statusCode: 401,
        message: "Authentication required",
      });
    }

    const directus = await getUserDirectus(event);
    const query = getQuery(event);
    const collection = query.collection as string | undefined;

    // Get current user's role
    const me = await directus.request(
      readMe({ fields: ["role.id", "role.admin_access"] })
    );

    // Admin users have full access
    if (me.role?.admin_access) {
      return {
        admin: true,
        permissions: [],
      };
    }

    // Build filter for permissions query
    const filter: Record<string, any> = {
      role: { _eq: me.role?.id },
    };

    if (collection) {
      filter.collection = { _eq: collection };
    }

    const permissions = await directus.request(
      readPermissions({
        filter,
        fields: ["id", "collection", "action", "fields", "permissions", "validation"],
      })
    );

    return {
      admin: false,
      permissions,
    };
  } catch (error: any) {
    console.error("[/api/directus/permissions] Error:", error.message);

    if (error.statusCode === 401) {
      throw createError({
        statusCode: 401,
        message: "Authentication required - please log in again",
      });
    }

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to fetch permissions",
    });
  }
});
