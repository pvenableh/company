import { useOrganization } from '~/composables/useOrganization';

export default defineNuxtRouteMiddleware(async (to) => {
	const { user, setUser } = useDirectusAuth();
	const { initializeOrganizations } = useOrganization();

	if (to.path === '/auth/signin') {
		return;
	}

	if (!user.value) {
		return navigateTo({ path: '/auth/signin', query: { redirect: to.fullPath } });
	}

	try {
		setUser(user.value); // Good practice: Explicitly set the user in the SDK
		await initializeOrganizations();
	} catch (error) {
		console.error('Error initializing organizations:', error);
		return abortNavigation('Failed to initialize organizations');
	}
});
