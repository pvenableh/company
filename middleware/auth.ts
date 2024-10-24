import { useAuthRefresh } from '~/composables/useAuthRefresh';

export default defineNuxtRouteMiddleware(async (to) => {
	const { readMe, setUser, user, refresh } = useDirectusAuth();
	const { canAttemptRefresh } = useAuthRefresh();

	// Skip for signin page to prevent redirect loops
	if (to.path === '/auth/signin') {
		return;
	}

	const handleAuthError = (error: unknown) => {
		console.error('Authentication error:', error instanceof Error ? error.message : 'Unknown error');
		return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
	};

	if (!user.value) {
		try {
			// Try to refresh token if allowed
			if (canAttemptRefresh()) {
				try {
					await refresh();
				} catch (refreshError) {
					console.warn('Token refresh failed:', refreshError instanceof Error ? refreshError.message : 'Unknown error');
				}
			}

			// Attempt to fetch user data
			const fetchedUser = await readMe();
			if (fetchedUser) {
				setUser(fetchedUser);
			} else {
				return handleAuthError(new Error('No user data found'));
			}
		} catch (error) {
			// For authentication errors, try one more refresh
			if (error instanceof Error && error.message.includes('401')) {
				if (canAttemptRefresh()) {
					try {
						await refresh();
						const fetchedUser = await readMe();
						if (fetchedUser) {
							setUser(fetchedUser);
							return;
						}
					} catch (refreshError) {
						return handleAuthError(refreshError);
					}
				}
			}

			return handleAuthError(error);
		}
	} else {
		// User exists but check if token needs refresh
		if (canAttemptRefresh()) {
			try {
				await refresh();
			} catch (refreshError) {
				console.warn(
					'Token refresh failed for existing user:',
					refreshError instanceof Error ? refreshError.message : 'Unknown error',
				);

				// Clear user data and redirect to login if refresh fails
				setUser(undefined);
				return handleAuthError(refreshError);
			}
		}
	}

	// Final check to ensure we have user data
	if (!user.value) {
		return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
	}
});
