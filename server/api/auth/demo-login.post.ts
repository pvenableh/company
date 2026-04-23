// server/api/auth/demo-login.post.ts
/**
 * Demo login — signs the requester in as the shared demo user.
 *
 * Reads credentials from server-side env vars (DEMO_USER_EMAIL +
 * DEMO_USER_PASSWORD) so no secret is ever exposed to the client. The demo
 * user must already exist — provision with `scripts/setup-demo-org.ts`.
 *
 * The demo org has a 10K monthly AI token budget + 3 scan credits; that
 * cap is enforced by `server/utils/ai-token-enforcement.ts` on AI routes,
 * so abuse through this endpoint is capped automatically.
 */

export default defineEventHandler(async (event) => {
  const email = process.env.DEMO_USER_EMAIL || 'demo@earnest.guru';
  const password = process.env.DEMO_USER_PASSWORD;

  if (!password) {
    throw createError({
      statusCode: 503,
      message: 'Demo mode is not configured. Contact the site owner.',
    });
  }

  try {
    const tokens = await directusLogin(email, password);

    const userData = await directusGetMe(tokens.access_token, [
      '*',
      'role.id',
      'role.name',
      'avatar.id',
    ]);

    await createUserSession(
      event,
      {
        id: userData.id,
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        avatar: typeof userData.avatar === 'object' ? userData.avatar?.id : userData.avatar,
        role: userData.role,
      },
      tokens,
    );

    return {
      success: true,
      user: {
        id: userData.id,
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
      },
    };
  } catch (error: any) {
    console.error('Demo login error:', error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: 'Demo login failed. Please try again later.',
    });
  }
});
