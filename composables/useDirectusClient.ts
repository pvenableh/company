// composables/useDirectusClient.ts
import { createDirectus, rest, authentication, realtime } from '@directus/sdk';

export function useDirectusClient() {
	const { data: session } = useAuth();
	const config = useRuntimeConfig();

	// Create Directus client with auth token from session
	const client = computed(() => {
		const directusUrl = config.public.directusUrl;

		const directusClient = createDirectus(directusUrl).with(authentication()).with(rest()).with(realtime()); // Include realtime if you need it

		// If we have a session with token, set it in the client
		if (session.value?.directusToken) {
			// Set the token for authentication
			directusClient.setToken(session.value.directusToken);
		}

		return directusClient;
	});

	// Helper to check if client is authenticated
	const isAuthenticated = computed(() => {
		return !!session.value?.directusToken;
	});

	return {
		client,
		isAuthenticated,
	};
}
