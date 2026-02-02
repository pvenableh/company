// server/api/auth/refresh.post.ts
/**
 * Token refresh endpoint - refreshes Directus tokens and updates session
 */

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    if (!session?.user) {
      throw createError({
        statusCode: 401,
        message: "No active session",
      });
    }

    const refreshToken = getSessionRefreshToken(session);
    if (!refreshToken) {
      throw createError({
        statusCode: 401,
        message: "No refresh token available",
      });
    }

    // Refresh tokens with Directus
    const newTokens = await directusRefresh(refreshToken);

    // Update session with new tokens
    await updateSessionTokens(event, session, newTokens);

    return {
      success: true,
      message: "Token refreshed successfully",
    };
  } catch (error: any) {
    console.error("Token refresh error:", error);

    // Clear session on refresh failure
    await clearUserSession(event);

    throw createError({
      statusCode: 401,
      message: "Session expired - please log in again",
    });
  }
});
