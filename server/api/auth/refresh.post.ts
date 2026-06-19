// server/api/auth/refresh.post.ts
/**
 * Token refresh endpoint - refreshes Directus tokens and updates session
 */

export default defineEventHandler(async (event) => {
  try {
    const session = await requireUserSession(event);

    const refreshToken = getSessionRefreshToken(session);
    if (!refreshToken) {
      throw createError({
        statusCode: 401,
        message: "No refresh token available",
      });
    }

    // Refresh tokens with Directus. dedupedDirectusRefresh collapses
    // concurrent refreshes (e.g. multiple tabs, or the proactive client timer
    // racing an in-flight request) onto a single rotation so they all receive
    // the same valid tokens instead of fighting over a single-use refresh token.
    const newTokens = await dedupedDirectusRefresh(refreshToken);

    // Update session with new tokens
    await updateSessionTokens(event, session, newTokens);

    return {
      success: true,
      message: "Token refreshed successfully",
    };
  } catch (error: any) {
    console.error("Token refresh error:", error);

    // Only clear the session when the refresh token itself is rejected by
    // Directus (truly expired/revoked). A transient/network failure should NOT
    // log the user out — that was a key cause of sessions dropping "for no
    // reason." A 401/403 from Directus means the token is dead; anything else
    // is treated as transient and the existing session is left intact.
    const status = error?.response?.status ?? error?.statusCode;
    const tokenRejected = status === 401 || status === 403;

    if (tokenRejected) {
      await clearUserSession(event);
      throw createError({
        statusCode: 401,
        message: "Session expired - please log in again",
      });
    }

    throw createError({
      statusCode: 503,
      message: "Could not refresh session, please retry",
    });
  }
});
