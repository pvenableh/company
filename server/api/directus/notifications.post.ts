// server/api/directus/notifications.post.ts
/**
 * Server API route for Directus notification operations
 * Supports: list, get, create, createMany, update, updateMany, delete, deleteMany
 */

import {
  createNotification,
  createNotifications,
  readNotification,
  readNotifications,
  updateNotification,
  updateNotifications,
  deleteNotification,
  deleteNotifications,
} from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    await requireUserSession(event);
    const body = await readBody(event);
    const { operation, id, ids, data, query } = body;

    if (!operation) {
      throw createError({
        statusCode: 400,
        message: "Operation is required",
      });
    }

    const directus = await getUserDirectus(event);

    switch (operation) {
      case "list":
        return await directus.request(readNotifications(query || {}));

      case "get":
        if (!id) throw createError({ statusCode: 400, message: "ID required" });
        return await directus.request(readNotification(id, query || {}));

      case "create":
        if (!data) throw createError({ statusCode: 400, message: "Data required" });
        return await directus.request(createNotification(data));

      case "createMany":
        if (!data) throw createError({ statusCode: 400, message: "Data required" });
        return await directus.request(createNotifications(data));

      case "update":
        if (!id || !data) throw createError({ statusCode: 400, message: "ID and data required" });
        return await directus.request(updateNotification(id, data));

      case "updateMany":
        if (!ids || !data) throw createError({ statusCode: 400, message: "IDs and data required" });
        return await directus.request(updateNotifications(ids, data));

      case "delete":
        if (!id) throw createError({ statusCode: 400, message: "ID required" });
        await directus.request(deleteNotification(id));
        return { success: true };

      case "deleteMany":
        if (!ids) throw createError({ statusCode: 400, message: "IDs required" });
        await directus.request(deleteNotifications(ids));
        return { success: true, deleted: ids.length };

      default:
        throw createError({ statusCode: 400, message: `Unknown operation: ${operation}` });
    }
  } catch (error: any) {
    console.error("[/api/directus/notifications] Error:", error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to perform notification operation",
    });
  }
});
