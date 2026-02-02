// server/api/auth/register.post.ts
/**
 * Registration endpoint - creates new user in Directus
 */

import { createUser } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { email, password, first_name, last_name, phone } = body;

    if (!email || !password) {
      throw createError({
        statusCode: 400,
        message: "Email and password are required",
      });
    }

    if (!first_name || !last_name) {
      throw createError({
        statusCode: 400,
        message: "First name and last name are required",
      });
    }

    // Use admin client to create user
    const directus = getTypedDirectus();
    const config = useRuntimeConfig();

    // Get default role for new users (configure in env or use a default)
    const defaultRoleId = config.public.directusRoleUser || null;

    const newUser = await directus.request(
      createUser({
        email,
        password,
        first_name,
        last_name,
        phone: phone || null,
        status: "active",
        role: defaultRoleId,
      })
    );

    // Optionally auto-login after registration
    // Uncomment if you want users logged in immediately after registration:
    /*
    const tokens = await directusLogin(email, password);
    await createUserSession(
      event,
      {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        avatar: null,
        role: newUser.role,
      },
      tokens
    );
    */

    return {
      success: true,
      message: "Registration successful",
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
      },
    };
  } catch (error: any) {
    console.error("Registration error:", error);

    // Handle Directus-specific errors
    if (error.errors?.[0]?.message?.includes("unique")) {
      throw createError({
        statusCode: 409,
        message: "An account with this email already exists",
      });
    }

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Registration failed",
    });
  }
});
