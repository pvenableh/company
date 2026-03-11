// server/api/directus/users/[id].ts
/**
 * Server API route for individual user operations
 * GET: Read user by ID
 * PATCH: Update user by ID
 * DELETE: Delete user by ID
 */

import { readUser, updateUser, deleteUser } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    await requireUserSession(event);
    const method = event.method;
    const userId = getRouterParam(event, "id");

    if (!userId) {
      throw createError({
        statusCode: 400,
        message: "User ID is required",
      });
    }

    if (method === "GET") {
      const query = getQuery(event);
      const fields = query.fields
        ? (query.fields as string).split(",")
        : ["*", "role.*"];

      return await withAuthRetry(event, async (directus) => {
        return await directus.request(readUser(userId, { fields }));
      });
    }

    if (method === "PATCH") {
      const updates = await readBody(event);
      return await withAuthRetry(event, async (directus) => {
        return await directus.request(updateUser(userId, updates));
      });
    }

    if (method === "DELETE") {
      return await withAuthRetry(event, async (directus) => {
        await directus.request(deleteUser(userId));
        return {
          success: true,
          message: "User deleted successfully",
        };
      });
    }

    throw createError({
      statusCode: 405,
      message: `Method ${method} not allowed`,
    });
  } catch (error: any) {
    console.error("User operation error:", error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to perform user operation",
    });
  }
});
