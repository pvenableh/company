// composables/useAuthActions.ts
// All operations go through server API routes - no client-side tokens

export function useAuthActions() {
	const { signIn, signOut } = useDirectusAuth();

	/**
	 * Login a user with credentials via server API
	 */
	const login = async (email: string, password: string, options = { redirect: true }) => {
		try {
			const result = await signIn({ email, password });

			if (options.redirect) {
				navigateTo('/');
			}

			return result;
		} catch (error) {
			console.error('Login error:', error);
			throw error;
		}
	};

	/**
	 * Logout the current user via server API
	 */
	const logout = async (options = { redirect: true, callbackUrl: '/' }) => {
		try {
			return await signOut({
				callbackUrl: options.redirect ? (options.callbackUrl || '/') : undefined,
			});
		} catch (error) {
			console.error('Logout error:', error);
			throw error;
		}
	};

	/**
	 * Request a password reset via server API
	 */
	const passwordRequest = async (email: string) => {
		return await $fetch('/api/directus/users/password-reset-request', {
			method: 'POST',
			body: { email },
		});
	};

	/**
	 * Reset a password using a reset token via server API
	 */
	const passwordReset = async (token: string, password: string) => {
		return await $fetch('/api/directus/users/password-reset', {
			method: 'POST',
			body: { token, password },
		});
	};

	/**
	 * Invite a user to the system via server API
	 */
	const inviteUser = async (email: string, role: string, inviteUrl?: string) => {
		return await $fetch('/api/directus/users/invite', {
			method: 'POST',
			body: { email, role, invite_url: inviteUrl },
		});
	};

	/**
	 * Accept a user invitation via server API
	 */
	const acceptUserInvite = async (token: string, password: string) => {
		return await $fetch('/api/directus/users/accept-invite', {
			method: 'POST',
			body: { token, password },
		});
	};

	return {
		login,
		logout,
		passwordRequest,
		passwordReset,
		inviteUser,
		acceptUserInvite,
	};
}
