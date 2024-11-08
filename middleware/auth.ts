export default defineNuxtRouteMiddleware(async (to) => {
	const { user, readMe } = useDirectusAuth();

	// Skip for signin page to prevent redirect loops
	if (to.path === '/auth/signin') {
		return;
	}

	if (!user.value) {
		try {
			const fetchedUser = await readMe();
			if (!fetchedUser) {
				return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
			}
		} catch (error) {
			console.error('Authentication error:', error);
			return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
		}
	}
});
