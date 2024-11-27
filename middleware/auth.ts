import { useAuthRefresh } from '~/composables/useAuthRefresh';

export default defineNuxtRouteMiddleware(async (to) => {
	const { readMe, setUser, user, refresh } = useDirectusAuth();
	const { canAttemptRefresh } = useAuthRefresh();

	if (to.path === '/auth/signin') {
		return;
	}

	const handleAuthError = (error: unknown) => {
		console.error('Authentication error:', error instanceof Error ? error.message : 'Unknown error');
		return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
	};

	if (!user.value) {
		try {
			if (canAttemptRefresh()) {
				try {
					await refresh();
				} catch (refreshError) {
					console.warn('Token refresh failed:', refreshError instanceof Error ? refreshError.message : 'Unknown error');
				}
			}

			const fetchedUser = await readMe();
			if (fetchedUser) {
				setUser(fetchedUser);
			} else {
				return handleAuthError(new Error('No user data found'));
			}
		} catch (error) {
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
	}

	if (!user.value) {
		return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
	}
});
