// server/api/directus/users/me.ts
/**
 * Server API route for current user operations
 * GET: Read current user
 * PATCH: Update current user
 */

import { readMe, updateMe } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const method = event.method;
    const directus = await getUserDirectus(event);

    if (method === "GET") {
      const query = getQuery(event);
      const fields = query.fields
        ? (query.fields as string).split(",")
        : ["*", "role.*", "avatar.*"];

      const user = await directus.request(readMe({ fields }));
      return user;
    }

    if (method === "PATCH") {
      const updates = await readBody(event);
      const user = await directus.request(updateMe(updates));
      return user;
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
