// server/api/directus/users/password-reset.post.ts
/**
 * Server API route for resetting password with token
 */

import { passwordReset } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { token, password } = body;

    if (!token || !password) {
      throw createError({
        statusCode: 400,
        message: "Token and password are required",
      });
    }

    const directus = getPublicDirectus();

    await directus.request(passwordReset(token, password));

    return {
      success: true,
      message: "Password reset successfully",
    };
  } catch (error: any) {
    console.error("Password reset error:", error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to reset password",
    });
  }
});
