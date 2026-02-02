// server/api/auth/me.get.ts
/**
 * Get current authenticated user from session
 */

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    if (!session?.user) {
      throw createError({
        statusCode: 401,
        message: "Not authenticated",
      });
    }

    return {
      user: session.user,
    };
  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 401,
      message: error.message || "Authentication required",
    });
  }
});
