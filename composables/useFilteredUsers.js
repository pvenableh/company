// composables/useFilteredUsers.js

export const useFilteredUsers = () => {
	const { readUsers } = useDirectusUsers();
	const junctionItems = useDirectusItems('junction_directus_users_teams');
	const { user: sessionUser, loggedIn } = useUserSession();
	const currentUser = computed(() => {
		return loggedIn.value ? sessionUser.value ?? null : null;
	});
	const { selectedOrg } = useOrganization();

	// Use a consistent DEFAULT_TEAM_ID
	const DEFAULT_TEAM_ID = 'org-default'; // Hardcoded fallback if config not available

	const filteredUsers = ref([]);
	const loading = ref(false);

	const fetchFilteredUsers = async (organizationId = null, teamId = null) => {
		try {
			loading.value = true;

			// Get the active organization ID
			const orgId = organizationId || selectedOrg.value;

			// Early validation
			if (!orgId) {
				console.warn('No organization ID provided or selected. Cannot fetch users.');
				filteredUsers.value = [];
				return;
			}

			// Build a single filter that handles both org and team in one query
			const userFilter = {
				organizations: {
					organizations_id: {
						id: { _eq: orgId },
					},
				},
			};

			// If a specific team is requested, add team filter to the same query
			if (teamId && teamId !== DEFAULT_TEAM_ID) {
				userFilter.teams = {
					teams_id: { _eq: teamId },
				};
			}

			// Single API call — org + team filter combined
			const users = await readUsers({
				fields: [
					'id',
					'first_name',
					'last_name',
					'email',
					'avatar',
					'organizations.organizations_id.id',
					'organizations.organizations_id.name',
				],
				filter: userFilter,
			});

			// Map the filtered users to the required format
			filteredUsers.value = users.map((user) => ({
				id: user.id,
				first_name: user.first_name || '',
				last_name: user.last_name || '',
				email: user.email || '',
				avatar: user.avatar,
				// Create a label for UI components
				label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User',
				value: user.id, // For direct use with select components
				// Include organizations data
				organizations:
					user.organizations?.map((org) => ({
						id: org.organizations_id?.id,
						name: org.organizations_id?.name,
					})) || [],
			}));
		} catch (error) {
			console.error('Error in fetchFilteredUsers:', error);
			filteredUsers.value = []; // Reset on error
		} finally {
			loading.value = false;
		}
	};

	// Helper function to get users available for a team
	const getAvailableTeamUsers = async (organizationId, teamId = null) => {
		try {
			console.log('getAvailableTeamUsers called with:', { organizationId, teamId });
			loading.value = true;

			if (!organizationId) {
				console.warn('No organization ID provided to getAvailableTeamUsers');
				return [];
			}

			// Get all users in the organization
			const orgFilter = {
				organizations: {
					organizations_id: { _eq: organizationId },
				},
			};

			const allOrgUsers = await readUsers({
				filter: orgFilter,
				fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
			});

			console.log(`Found ${allOrgUsers.length} users in organization`);

			// If no team specified or default team, return all org users
			if (!teamId || teamId === DEFAULT_TEAM_ID) {
				return allOrgUsers;
			}

			try {
				// Get users already in the team
				const teamUsers = await junctionItems.list({
					filter: {
						teams_id: { _eq: teamId },
					},
					fields: ['directus_users_id'],
				});

				console.log(`Found ${teamUsers.length} users already in team`);

				// Create a Set of user IDs already in the team for faster lookups
				const teamUserIds = new Set();
				teamUsers.forEach((item) => {
					// Handle both object and string IDs
					const userId =
						typeof item.directus_users_id === 'object' ? item.directus_users_id.id : item.directus_users_id;

					if (userId) teamUserIds.add(userId);
				});

				// Return users not already in the team
				return allOrgUsers.filter((user) => !teamUserIds.has(user.id));
			} catch (teamError) {
				console.error('Error fetching team users:', teamError);
				// Fall back to all organization users if team filtering fails
				return allOrgUsers;
			}
		} catch (error) {
			console.error('Error in getAvailableTeamUsers:', error);
			return [];
		} finally {
			loading.value = false;
		}
	};

	return {
		filteredUsers,
		fetchFilteredUsers,
		getAvailableTeamUsers,
		loading,
		DEFAULT_TEAM_ID,
	};
};

// For backward compatibility
export default useFilteredUsers;
