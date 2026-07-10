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
        const updated = await directus.request(updateMe(updates));

        // Keep the nuxt-auth-utils session user in sync with the profile edit.
        // The header, avatar and initials read identity (name/email/avatar) from
        // the sealed session cookie — NOT from Directus — so without this the
        // cookie stays frozen at its login-time values and edits look "unsaved"
        // after navigating away and back. Only touch the identity fields the
        // session actually holds; leave `role` alone to avoid shape drift.
        try {
          const session = await getUserSession(event);
          if (session?.user) {
            // `updated` is the full user record, so these are the authoritative
            // current values (avatar may be null when the user removed it — use
            // it directly rather than falling back to the stale session value).
            await setUserSession(event, {
              ...session,
              user: {
                ...session.user,
                email: updated.email ?? session.user.email,
                first_name: updated.first_name ?? null,
                last_name: updated.last_name ?? null,
                avatar:
                  typeof updated.avatar === "object"
                    ? updated.avatar?.id ?? null
                    : updated.avatar ?? null,
              },
            });
          }
        } catch (sessionError) {
          console.warn("[users/me] session refresh after PATCH failed:", sessionError);
        }

        return updated;
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
