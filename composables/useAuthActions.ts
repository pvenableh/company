// composables/useAuthActions.ts
import {
	passwordRequest as directusPasswordRequest,
	passwordReset as directusPasswordReset,
	inviteUser as directusInviteUser,
	acceptUserInvite as directusAcceptInvite,
} from '@directus/sdk';

export function useAuthActions() {
	const { signIn, signOut } = useAuth();
	const { client } = useDirectusClient();
	const config = useRuntimeConfig();

	/**
	 * Login a user with credentials
	 * This is a wrapper around next-auth's signIn
	 */
	const login = async (email: string, password: string, options = { redirect: true }) => {
		try {
			return await signIn('credentials', {
				email,
				password,
				...options,
			});
		} catch (error) {
			console.error('Login error:', error);
			throw error;
		}
	};

	/**
	 * Logout the current user
	 * This is a wrapper around next-auth's signOut
	 */
	const logout = async (options = { redirect: true, callbackUrl: '/' }) => {
		try {
			return await signOut(options);
		} catch (error) {
			console.error('Logout error:', error);
			throw error;
		}
	};

	/**
	 * Request a password reset
	 * Uses the Directus SDK via your client composable
	 */
	const passwordRequest = async (email: string) => {
		try {
			return await client.value.request(directusPasswordRequest(email));
		} catch (error) {
			console.error('Password request error:', error);
			throw error;
		}
	};

	/**
	 * Reset a password using a reset token
	 * Uses the Directus SDK via your client composable
	 */
	const passwordReset = async (token: string, password: string) => {
		try {
			return await client.value.request(directusPasswordReset(token, password));
		} catch (error) {
			console.error('Password reset error:', error);
			throw error;
		}
	};

	/**
	 * Invite a user to the system
	 * Uses the Directus SDK's built-in inviteUser function
	 */
	const inviteUser = async (email: string, role: string, inviteUrl?: string) => {
		try {
			const { isAuthenticated } = useDirectusClient();

			// Ensure we have an authentication token
			if (!isAuthenticated.value) {
				throw new Error('Authentication required to invite users');
			}

			// Configure the invite options
			const options = inviteUrl ? { inviteUrl } : undefined;

			// Use the SDK's inviteUser function
			return await client.value.request(directusInviteUser(email, role, options));
		} catch (error) {
			console.error('Invite user error:', error);
			throw error;
		}
	};

	/**
	 * Accept a user invitation
	 * Uses the Directus SDK's built-in acceptUserInvite function
	 */
	const acceptUserInvite = async (token: string, password: string) => {
		try {
			return await client.value.request(directusAcceptInvite(token, password));
		} catch (error) {
			console.error('Accept invite error:', error);
			throw error;
		}
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
