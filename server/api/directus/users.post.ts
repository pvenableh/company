// server/api/directus/users.post.ts
/**
 * Server API route for user collection operations
 * Supports: list, create, createMany, updateMany, deleteMany
 */

import {
  readUsers,
  createUser,
  createUsers,
  updateUsers,
  deleteUsers,
} from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    await requireUserSession(event);
    const body = await readBody(event);
    const { operation, data, ids, query } = body;

    if (!operation) {
      throw createError({
        statusCode: 400,
        message: "Operation is required",
      });
    }

    const directus = await getUserDirectus(event);

    switch (operation) {
      case "list":
        return await directus.request(readUsers(query || {}));

      case "create":
        if (!data) throw createError({ statusCode: 400, message: "Data required" });
        return await directus.request(createUser(data));

      case "createMany":
        if (!data) throw createError({ statusCode: 400, message: "Data required" });
        return await directus.request(createUsers(data));

      case "updateMany":
        if (!ids || !data) throw createError({ statusCode: 400, message: "IDs and data required" });
        return await directus.request(updateUsers(ids, data));

      case "deleteMany":
        if (!ids) throw createError({ statusCode: 400, message: "IDs required" });
        await directus.request(deleteUsers(ids));
        return { success: true, deleted: ids.length };

      default:
        throw createError({ statusCode: 400, message: `Unknown operation: ${operation}` });
    }
  } catch (error: any) {
    console.error("[/api/directus/users] Error:", error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to perform user operation",
    });
  }
});
