// server/api/directus/users/me.ts
/**
 * Server API route for current user operations
 * GET: Read current user
 * PATCH: Update current user
 */

import { readMe, updateMe } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    await requireUserSession(event);
    const method = event.method;

    if (method === "GET") {
      const query = getQuery(event);
      const fields = query.fields
        ? (query.fields as string).split(",")
        : ["*", "role.*", "avatar.*"];

      return await withAuthRetry(event, async (directus) => {
        return await directus.request(readMe({ fields }));
      });
    }

    if (method === "PATCH") {
      const updates = await readBody(event);
      return await withAuthRetry(event, async (directus) => {
        return await directus.request(updateMe(updates));
      });
    }

    throw createError({
      statusCode: 405,
      message: `Method ${method} not allowed`,
    });
  } catch (error: any) {
    console.error("User me operation error:", error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to perform user operation",
    });
  }
});
