// plugins/auth-token-sync.ts

export default defineNuxtPlugin(() => {
	// This plugin ensures that the Directus token is always synced with the next-auth session
	const { data: authData } = useAuth();
	let lastToken: string | null = null;

	watchEffect(() => {
		const directusToken = authData.value?.directusToken;
		if (directusToken !== lastToken) {
			lastToken = directusToken;
			console.log('Auth token changed, plugin updated lastToken');
			// No need to dispatch event here anymore
		}
	});

	// Expose a function to get the current auth token
	const getCurrentToken = () => authData.value?.directusToken || null;

	// The applyTokenToClient function might be less necessary now
	// const applyTokenToClient = (client: DirectusClient) => {
	//     const token = getCurrentToken();
	//     if (token) {
	//         client.setToken(token);
	//         return true;
	//     }
	//     return false;
	// };

	return {
		provide: {
			authTokenSync: {
				getCurrentToken,
				// applyTokenToClient, // Optionally remove if not used elsewhere
			},
		},
	};
});
