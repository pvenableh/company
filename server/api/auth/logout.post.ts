// server/api/auth/logout.post.ts
/**
 * Logout endpoint - clears session and invalidates Directus tokens
 */

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event);

    // If there's a refresh token, logout from Directus
    const refreshToken = getSessionRefreshToken(session);
    if (refreshToken) {
      try {
        await directusLogout(refreshToken);
      } catch (error) {
        // Ignore logout errors - token might already be invalid
        console.warn("Directus logout failed (token may be invalid):", error);
      }
    }

    // Clear the session
    await clearUserSession(event);

    return {
      success: true,
      message: "Logged out successfully",
    };
  } catch (error: any) {
    console.error("Logout error:", error);

    // Still clear session even if Directus logout fails
    await clearUserSession(event);

    return {
      success: true,
      message: "Logged out",
    };
  }
});
