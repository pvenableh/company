// server/api/directus/revisions.post.ts
/**
 * Server API route for Directus revision operations
 * Supports: list, get
 */

import {
  readRevision,
  readRevisions,
} from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { operation, id, query } = body;

    if (!operation) {
      throw createError({
        statusCode: 400,
        message: "Operation is required",
      });
    }

    const directus = await getUserDirectus(event);

    switch (operation) {
      case "list":
        return await directus.request(readRevisions(query || {}));

      case "get":
        if (!id) throw createError({ statusCode: 400, message: "ID required" });
        return await directus.request(readRevision(id, query || {}));

      default:
        throw createError({ statusCode: 400, message: `Unknown operation: ${operation}` });
    }
  } catch (error: any) {
    console.error("[/api/directus/revisions] Error:", error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to perform revision operation",
    });
  }
});
