// plugins/auth-token-sync.ts

// Define our custom session type without extending Session
interface DirectusSession {
	directusToken?: string;
	refreshToken?: string;
	user?: {
		id: string;
		email: string;
		first_name?: string;
		last_name?: string;
		avatar?: string;
		role?: string;
		organizations?: any[];
		[key: string]: any;
	};
	expires?: string;
	[key: string]: any;
}

export default defineNuxtPlugin((nuxtApp) => {
	const { data: authData, status } = useAuth();
	const { client } = useDirectusClient();
	const lastToken = ref<string | null>(null);

	// Define the proper type for the storage sync return
	interface StorageSyncReturn {
		state: Ref<unknown>;
		getValue: () => any;
		setValue: (value: any) => any;
		clearValue: () => any;
		restoreValue: (force?: boolean) => boolean;
		validateValue: (value: any, allowlist?: any[]) => boolean;
		setupSyncListener: () => () => void;
		enableDebug: () => void;
		disableDebug: () => void;
	}

	const syncStorage = useStorageSync('directus_auth', {
		debug: false,
		priorities: ['cookie', 'localStorage', 'state'],
		cookie: {
			maxAge: 60 * 60 * 24 * 7, // 7 days
			path: '/',
			sameSite: 'lax',
		},
	}) as StorageSyncReturn;

	// Initial load - restore from storage if needed
	// Use nuxtApp.hook instead of onMounted
	nuxtApp.hook('app:created', () => {
		// Only run on client-side
		if (process.client) {
			// If auth isn't ready yet, try to restore from storage
			if (status.value === 'loading') {
				const storedAuth = syncStorage.getValue();
				if (storedAuth && storedAuth.directusToken) {
					console.log('Restoring auth from storage');
					lastToken.value = storedAuth.directusToken;
					if (client.value) {
						client.value.setToken(storedAuth.directusToken);
					}
				}
			}
		}
	});

	// Watch for auth changes and sync to storage
	watchEffect(() => {
		const session = authData.value as DirectusSession | null | undefined;
		const directusToken = session?.directusToken;

		if (directusToken !== lastToken.value) {
			lastToken.value = directusToken ?? null;
			console.log('Auth token changed, updating storage');

			if (directusToken) {
				// Store auth data
				syncStorage.setValue({
					directusToken,
					refreshToken: session?.refreshToken,
					userId: session?.user?.id,
				});
			} else {
				// Clear auth data
				syncStorage.clearValue();
			}
		}
	});

	// Define a function to get the current token
	const getCurrentToken = (): string | null => {
		const session = authData.value as DirectusSession | null | undefined;
		return session?.directusToken || lastToken.value || null;
	};

	// Define a type for the client with setToken method
	interface ClientWithToken {
		setToken: (token: string) => void;
	}

	// Apply token to any Directus client with a setToken method
	const applyTokenToClient = <T extends ClientWithToken>(clientInstance: T): boolean => {
		const token = getCurrentToken();
		if (token) {
			clientInstance.setToken(token);
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
