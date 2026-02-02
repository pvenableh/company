// server/api/auth/me.get.ts
/**
 * Get current authenticated user from session
 */

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  return {
    user: session.user,
  };
});
