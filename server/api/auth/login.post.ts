// server/api/auth/login.post.ts
/**
 * Login endpoint - authenticates user with Directus and creates session
 */

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { email, password } = body;

    if (!email || !password) {
      throw createError({
        statusCode: 400,
        message: "Email and password are required",
      });
    }

    // Login to Directus
    const tokens = await directusLogin(email, password);

    // Get user data
    const userData = await directusGetMe(tokens.access_token, [
      "*",
      "role.id",
      "role.name",
      "avatar.id",
    ]);

    // Create session
    await createUserSession(
      event,
      {
        id: userData.id,
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        avatar: typeof userData.avatar === "object" ? userData.avatar?.id : userData.avatar,
        role: userData.role,
      },
      tokens
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
    console.error("Login error:", error);

    // Handle Directus-specific errors
    if (error.errors?.[0]?.message) {
      throw createError({
        statusCode: 401,
        message: error.errors[0].message,
      });
    }

    throw createError({
      statusCode: error.statusCode || 401,
      message: error.message || "Invalid credentials",
    });
  }
});
