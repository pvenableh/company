// server/api/directus/users/password-reset-request.post.ts
/**
 * Server API route for requesting password reset
 */

import { passwordRequest } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { email, reset_url } = body;

    if (!email) {
      throw createError({
        statusCode: 400,
        message: "Email is required",
      });
    }

    const config = useRuntimeConfig();
    const directus = getPublicDirectus();

    await directus.request(
      passwordRequest(email, reset_url || `${config.public.appUrl}/auth/password-reset`)
    );

    return {
      success: true,
      message: "Password reset email sent",
    };
  } catch (error: any) {
    console.error("Password reset request error:", error);

    // Don't reveal if email exists or not
    return {
      success: true,
      message: "If an account exists with this email, a password reset link has been sent",
    };
  }
});
