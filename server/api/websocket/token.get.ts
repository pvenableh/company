// server/api/websocket/token.get.ts
/**
 * Get access token for WebSocket connection
 * Returns the current user's access token for client-side WebSocket auth
 */

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const accessToken = getSessionAccessToken(session);

  if (!accessToken) {
    throw createError({
      statusCode: 401,
      message: "No access token available",
    });
  }

  // Check if token needs refresh
  if (isSessionExpired(session)) {
    const refreshToken = getSessionRefreshToken(session);
    if (refreshToken) {
      try {
        const newTokens = await directusRefresh(refreshToken);
        await updateSessionTokens(event, session, newTokens);
        return { token: newTokens.access_token };
      } catch {
        throw createError({
          statusCode: 401,
          message: "Session expired",
        });
      }
    }
  }

  return { token: accessToken };
});
