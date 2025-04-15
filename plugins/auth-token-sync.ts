// plugins/auth-token-sync.ts

export default defineNuxtPlugin(() => {
	const { data: authData } = useAuth();
	let lastToken: string | null = null;

	watchEffect(() => {
		const directusToken = authData.value?.directusToken;
		if (directusToken !== lastToken) {
			lastToken = directusToken ?? null;
			console.log('Auth token changed, plugin updated lastToken');
		}
	});

	// Expose a function to get the current auth token
	const getCurrentToken = () => authData.value?.directusToken || null;

	// Apply token to any Directus client with a setToken method
	const applyTokenToClient = <T extends { setToken: (token: string) => void }>(client: T) => {
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
