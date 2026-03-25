// server/api/auth/sso-callback.post.ts
/**
 * SSO Callback endpoint — receives tokens from Directus SSO login
 *
 * After Directus handles the OAuth exchange with Google/Apple/Microsoft,
 * it redirects back to our app with access_token and refresh_token.
 * The client-side callback page sends those tokens here to create a session.
 *
 * Flow:
 *   1. User clicks "Sign in with Google" → redirect to Directus SSO
 *   2. Directus handles OAuth with provider → redirects back with tokens
 *   3. /auth/sso-callback (page) captures tokens from URL
 *   4. Page POSTs tokens here → we validate, fetch user, create session
 */

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { access_token, refresh_token, expires } = body;

    if (!access_token || !refresh_token) {
      throw createError({
        statusCode: 400,
        message: 'Missing SSO tokens — access_token and refresh_token are required',
      });
    }

    // Validate the token by fetching the user from Directus
    const userData = await directusGetMe(access_token, [
      '*',
      'role.id',
      'role.name',
      'avatar.id',
    ]);

    if (!userData?.id) {
      throw createError({
        statusCode: 401,
        message: 'Invalid SSO token — could not fetch user',
      });
    }

    // Create session — same as email/password login
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
      {
        access_token,
        refresh_token,
        expires: expires || 900000, // Default 15 min if not provided
      }
    );

    return {
      success: true,
      user: {
        id: userData.id,
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        role: userData.role,
      },
    };
  } catch (error: any) {
    console.error('SSO callback error:', error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: 'SSO login failed',
    });
  }
});
