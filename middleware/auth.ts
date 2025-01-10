import { useAuthRefresh } from '~/composables/useAuthRefresh';

export default defineNuxtRouteMiddleware(async (to) => {
	const { readMe, setUser, refresh } = useDirectusAuth();
	const { isRefreshAllowed } = useAuthRefresh(5000);
	const user = useState('directusUser', () => null);
	const directusRefreshToken = useCookie('directus_refresh_token');

	if (to.path === '/auth/signin') {
		return;
	}

	const handleAuthError = (error: unknown) => {
		console.error('Authentication error:', error instanceof Error ? error.message : 'Unknown error');
		user.value = null;
		directusRefreshToken.value = null;
		return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
	};

	if (user.value) {
		// User data exists in storage, sync with SDK and return
		setUser(user.value); // Sync with SDK
		return;
	}

	if (directusRefreshToken.value && isRefreshAllowed()) {
		try {
			await refresh();
			const fetchedUser = await readMe();
			if (fetchedUser) {
				user.value = fetchedUser;
				setUser(fetchedUser); // Sync with SDK
			} else {
				return handleAuthError(new Error('No user data after refresh'));
			}
		} catch (refreshError) {
			return handleAuthError(refreshError);
		}
	} else {
		try {
			const fetchedUser = await readMe();
			if (fetchedUser) {
				user.value = fetchedUser;
				setUser(fetchedUser); // Sync with SDK
			} else {
				return handleAuthError(new Error('No user data on initial load'));
			}
		} catch (error) {
			return handleAuthError(error);
		}
	}

	if (!user.value) {
		return handleAuthError(new Error('No user data after all attempts')); // More specific error
	}
});
