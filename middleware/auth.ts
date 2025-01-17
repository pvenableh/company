import { useAuthRefresh } from '~/composables/useAuthRefresh';
import { useOrganization } from '~/composables/useOrganization';

export default defineNuxtRouteMiddleware(async (to) => {
	const { readMe, setUser, refresh } = useDirectusAuth();
	const { isRefreshAllowed } = useAuthRefresh(5000);
	const user = useState('directusUser', () => null); // State to hold user data
	const directusRefreshToken = useCookie('directus_refresh_token'); // Token from cookie
	const { initializeOrganizations } = useOrganization(); // Organization setup

	// Skip middleware for the sign-in page
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
		// User data exists in state, sync with SDK and initialize organizations
		setUser(user.value);
		await initializeOrganizations();
		return;
	}

	try {
		if (directusRefreshToken.value && isRefreshAllowed()) {
			// If a refresh token exists and refresh is allowed, attempt token refresh
			await refresh();
		}

		// Fetch the authenticated user's profile
		const fetchedUser = await readMe();
		if (fetchedUser) {
			user.value = fetchedUser;
			setUser(fetchedUser); // Sync user with SDK
			await initializeOrganizations(); // Initialize organizations
		} else {
			return handleAuthError(new Error('Failed to fetch user profile.'));
		}
	} catch (error) {
		return handleAuthError(error);
	}

	if (!user.value) {
		return handleAuthError(new Error('No user data available.'));
	}
});
