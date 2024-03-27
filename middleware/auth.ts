export default defineNuxtRouteMiddleware(async (to) => {
	const { readMe, setUser, user, refresh } = useDirectusAuth();

	if (!user.value) {
		try {
			const fetchedUser = await readMe();

			if (fetchedUser) {
				setUser(fetchedUser);
			} else {
				// If no user data is fetched, redirect to sign-in with a `redirect` query parameter
				return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
			}
		} catch (error) {
			console.error('Error fetching user data:', error);
			// Redirect to sign-in with a `redirect` query parameter in case of any error
			return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
		}
	}

	// Finally, if still no user data after all attempts, redirect to sign-in
	if (!user.value) {
		return navigateTo(`/auth/signin?redirect=${encodeURIComponent(to.fullPath)}`);
	}
});
