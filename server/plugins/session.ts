// server/plugins/session.ts
// Session hooks for nuxt-auth-utils
// Called during session lifecycle events (fetch, clear)

export default defineNitroPlugin(() => {
  // Called when the session is fetched during SSR or via useUserSession().fetch()
  sessionHooks.hook("fetch", async (session, event) => {
    // If session has a user but tokens are expired, attempt refresh
    if (session.user && session.expiresAt) {
      const isExpired = isSessionExpired(session, 60000); // 60s buffer

      if (isExpired) {
        const refreshToken = getSessionRefreshToken(session);
        if (refreshToken) {
          try {
            const newTokens = await directusRefresh(refreshToken);
            await updateSessionTokens(event, session, newTokens);
          } catch (error) {
            console.warn("[Session Hook] Token refresh failed during fetch:", error);
            // Don't throw - let the request proceed and handle auth failure downstream
          }
        }
      }
    }
  });

  // Called when the session is cleared via useUserSession().clear() or clearUserSession()
  sessionHooks.hook("clear", async (session, event) => {
    // Invalidate Directus refresh token on logout
    const refreshToken = getSessionRefreshToken(session);
    if (refreshToken) {
      try {
        await directusLogout(refreshToken);
      } catch (error) {
        // Ignore - token might already be invalid
        console.warn("[Session Hook] Directus logout during clear:", error);
      }
    }
  });
});
