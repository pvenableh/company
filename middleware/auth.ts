// middleware/auth.ts
export default defineNuxtRouteMiddleware(async (to) => {
	console.log('--- Auth Middleware Executing ---');
	console.log('Target Route:', to.path);

	const { status, data: authData } = await useAuth();
	const { selectedOrg, initializeOrganizations, setOrganization } = useOrganization();
	const { selectedTeam, fetchTeams, visibleTeams, hasAdminAccess } = useTeams();

	// Skip auth check for signin page
	if (to.path === '/auth/signin') {
		console.log('--- On signin route, allowing navigation ---');
		return;
	}

	// If no user, redirect to signin with the current path as redirect target
	if (status.value === 'unauthenticated') {
		console.log('--- User not logged in, redirecting to signin ---');
		return navigateTo({
			path: '/auth/signin',
			query: { redirect: to.fullPath },
		});
	}

	// User is authenticated at this point
	const user = authData.value?.user;
	console.log('--- User authenticated:', user?.email);

	// Handle redirect from query parameter if it exists
	// This is for the case when a user was redirected to signin and is now authenticated
	const redirectPath = to.query.redirect;
	if (redirectPath && typeof redirectPath === 'string' && redirectPath !== to.path) {
		console.log('--- Redirecting to:', redirectPath);
		return navigateTo(redirectPath);
	}

	// Set user in directus auth state if needed (compatibility layer)
	const { setUser } = useDirectusAuth();
	if (setUser && user) {
		setUser(user);
	}

	// --- Organization Handling ---
	console.log('--- Organization Handling ---');

	// Initialize organizations if not already done
	if (!selectedOrg.value) {
		console.log('No organization selected, initializing...');
		await initializeOrganizations();
		console.log('Organization initialization complete, selectedOrg:', selectedOrg.value);

		// If still no organization selected and this route requires one, and user is not admin
		// redirect to organization selection
		if (selectedOrg.value === null && isOrganizationRequiredForRoute(to.path) && !hasAdminAccess(user)) {
			console.log('Non-admin user with no organization selected on restricted route');

			// Instead of redirecting, force select the first organization
			// This prevents normal users from ever having null organization
			if ((user?.organizations ?? []).length > 0) {
				const firstOrgId = user?.organizations?.[0]?.organizations_id?.id;
				if (firstOrgId) {
					console.log('Automatically selecting first organization:', firstOrgId);
					setOrganization(firstOrgId);
				}
			}
		}
	} else {
		console.log('Organization already selected:', selectedOrg.value);
	}

	// --- Team Handling ---
	console.log('--- Team Handling ---');

	// Only fetch teams if a specific organization is selected
	if (selectedOrg.value) {
		console.log('Fetching teams for organization:', selectedOrg.value);
		await fetchTeams(selectedOrg.value);
		console.log('Teams fetched, count:', visibleTeams.value.length);
		console.log('Selected team:', selectedTeam.value);
	} else {
		console.log('In "All Organizations" mode, skipping team fetch');
	}

	console.log('--- Auth Middleware Complete ---');
});

// Helper function to determine if a route requires an organization
function isOrganizationRequiredForRoute(path: string) {
	// List routes that require an organization to function
	const orgRequiredRoutes = ['/tickets', '/tickets/', '/teams', '/teams/', '/projects', '/projects/'];

	// Check if the current path starts with any of the required routes
	return orgRequiredRoutes.some((route) => path.startsWith(route));
}
