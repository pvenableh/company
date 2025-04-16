// composables/useDirectusClient.ts
import { createDirectus, rest, authentication, realtime } from '@directus/sdk';

export function useDirectusClient() {
	const { data: session, status } = useAuth();
	const config = useRuntimeConfig();
	const isInitializing = ref(true);

	// Create Directus client with auth token from session
	const client = computed(() => {
		const directusUrl = config.public.directusUrl;
		const directusClient = createDirectus(directusUrl).with(authentication()).with(rest()).with(realtime());

		// If we have a session with token, set it in the client
		if (session.value?.directusToken) {
			// Set the token for authentication
			directusClient.setToken(session.value.directusToken);
		}

		return directusClient;
	});

	// Helper to check if client is authenticated and ready
	const isAuthenticated = computed(() => {
		return !!session.value?.directusToken;
	});

	// Use watch instead of onMounted for lifecycle management
	watch(
		status,
		(newStatus) => {
			if (newStatus === 'authenticated' || newStatus === 'unauthenticated') {
				isInitializing.value = false;
			}
		},
		{ immediate: true },
	);

	// Safety timeout to prevent infinite loading
	if (import.meta.client) {
		setTimeout(() => {
			isInitializing.value = false;
		}, 2000);
	}

	return {
		client,
		isAuthenticated,
		isInitializing,
	};
}
