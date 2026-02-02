// composables/useDirectusUser.ts
/**
 * useDirectusUser - User-specific operations composable
 *
 * Handles current user operations, profile updates, user management,
 * invitations, and password resets using native Directus SDK methods
 *
 * Usage:
 * const { me, updateProfile, inviteUser, acceptInvite, resetPassword } = useDirectusUser()
 */

export const useDirectusUser = () => {
  const { loggedIn } = useUserSession();

  /**
   * Get current user data
   */
  const me = async (fields: string[] = ["*", "role.*"]) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const data = await $fetch("/api/directus/users/me", {
      method: "GET",
      query: { fields: fields.join(",") },
    });

    return data;
  };

  /**
   * Update current user's profile
   */
  const updateProfile = async (updates: Record<string, any>) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const data = await $fetch("/api/directus/users/me", {
      method: "PATCH",
      body: updates,
    });

    return data;
  };

  /**
   * Invite a new user
   */
  const inviteUser = async (
    email: string,
    role: string,
    additionalData?: Record<string, any>
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const data = await $fetch("/api/directus/users/invite", {
      method: "POST",
      body: {
        email,
        role,
        ...additionalData,
      },
    });

    return data;
  };

  /**
   * Accept an invitation and set password
   */
  const acceptInvite = async (token: string, password: string) => {
    const data = await $fetch("/api/directus/users/accept-invite", {
      method: "POST",
      body: {
        token,
        password,
      },
    });

    return data;
  };

  /**
   * Request password reset
   */
  const requestPasswordReset = async (email: string, resetUrl?: string) => {
    const data = await $fetch("/api/directus/users/password-reset-request", {
      method: "POST",
      body: { email, reset_url: resetUrl },
    });

    return data;
  };

  /**
   * Reset password with token
   */
  const resetPassword = async (token: string, password: string) => {
    const data = await $fetch("/api/directus/users/password-reset", {
      method: "POST",
      body: {
        token,
        password,
      },
    });

    return data;
  };

  /**
   * Get user by ID
   */
  const getUser = async (
    userId: string,
    fields: string[] = ["*", "role.*"]
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const data = await $fetch(`/api/directus/users/${userId}`, {
      method: "GET",
      query: { fields: fields.join(",") },
    });

    return data;
  };

  /**
   * Update user by ID
   */
  const updateUser = async (userId: string, updates: Record<string, any>) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const data = await $fetch(`/api/directus/users/${userId}`, {
      method: "PATCH",
      body: updates,
    });

    return data;
  };

  /**
   * Delete user by ID
   */
  const deleteUser = async (userId: string) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const data = await $fetch(`/api/directus/users/${userId}`, {
      method: "DELETE",
    });

    return data;
  };

  return {
    me,
    updateProfile,
    inviteUser,
    acceptInvite,
    requestPasswordReset,
    resetPassword,
    getUser,
    updateUser,
    deleteUser,
  };
};
