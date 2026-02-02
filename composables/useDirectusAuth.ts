// composables/useDirectusAuth.ts
/**
 * useDirectusAuth - Authentication composable
 *
 * Handles authentication flows (login, logout, register) by calling
 * server endpoints and integrating with nuxt-auth-utils session management.
 *
 * Usage:
 * const { login, logout, register, user, loggedIn } = useDirectusAuth()
 */

export const useDirectusAuth = () => {
  // Get session from nuxt-auth-utils
  const session = useUserSession();

  // Computed refs from session
  const user = computed(() => session.user.value);
  const loggedIn = computed(() => session.loggedIn.value);

  /**
   * Login with email and password
   */
  const login = async (credentials: { email: string; password: string }) => {
    try {
      const data = await $fetch("/api/auth/login", {
        method: "POST",
        body: credentials,
      });

      // Fetch the updated session
      await session.fetch();

      return data;
    } catch (error: any) {
      const errorMessage =
        error?.data?.message ||
        error?.statusMessage ||
        error?.message ||
        "Login failed";
      const enhancedError = new Error(errorMessage);
      (enhancedError as any).data = error?.data;
      (enhancedError as any).statusCode = error?.statusCode;
      throw enhancedError;
    }
  };

  /**
   * Logout current user
   */
  const logout = async () => {
    try {
      await $fetch("/api/auth/logout", {
        method: "POST",
      });

      // Clear the session
      await session.clear();
    } catch (error: any) {
      // Even if the server call fails, clear local session
      await session.clear();
      throw new Error(error.message || "Logout failed");
    }
  };

  /**
   * Register a new user
   */
  const register = async (userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }) => {
    try {
      const data = await $fetch("/api/auth/register", {
        method: "POST",
        body: userData,
      });

      return data;
    } catch (error: any) {
      throw new Error(
        error?.data?.message || error?.message || "Registration failed"
      );
    }
  };

  /**
   * Request password reset email
   */
  const requestPasswordReset = async (email: string) => {
    const { requestPasswordReset: resetRequest } = useDirectusUser();
    return await resetRequest(email);
  };

  /**
   * Reset password with token
   */
  const resetPassword = async (token: string, password: string) => {
    const { resetPassword: reset } = useDirectusUser();
    return await reset(token, password);
  };

  /**
   * Refresh current user session
   */
  const refreshUser = async () => {
    try {
      await $fetch("/api/auth/refresh", {
        method: "POST",
      });

      await session.fetch();
      return session.user.value;
    } catch (error: any) {
      await session.fetch();
      return session.user.value;
    }
  };

  return {
    // State
    user,
    loggedIn,

    // Actions
    login,
    logout,
    register,
    refreshUser,
    requestPasswordReset,
    resetPassword,
  };
};
