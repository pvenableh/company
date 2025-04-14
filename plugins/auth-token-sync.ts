// plugins/auth-token-sync.ts
import { DirectusClient } from '@directus/sdk';

export default defineNuxtPlugin(() => {
	// This plugin ensures that the Directus token is always synced with the next-auth session
	const { data: authData } = useAuth();
	let lastToken: string | null = null;

	// Watch for auth changes and update Directus-using composables
	watchEffect(() => {
		const directusToken = authData.value?.directusToken;

		// Only update if the token has changed
		if (directusToken !== lastToken) {
			lastToken = directusToken;
			console.log('Auth token changed, syncing with Directus clients');

			// Emit a custom event that Directus clients can listen for
			if (process.client) {
				window.dispatchEvent(
					new CustomEvent('directus:token-change', {
						detail: { token: directusToken },
					}),
				);
			}
		}
	});

	// Expose a function to get the current auth token
	const getCurrentToken = () => authData.value?.directusToken || null;

	// Expose a function to apply the token to any Directus client instance
	const applyTokenToClient = (client: DirectusClient) => {
		const token = getCurrentToken();
		if (token) {
			client.setToken(token);
			return true;
		}
		return false;
	};

	return {
		provide: {
			authTokenSync: {
				getCurrentToken,
				applyTokenToClient,
			},
		},
	};
});
