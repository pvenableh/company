// composables/useFilteredUsers.js
export default function useFilteredUsers() {
	const { readUsers } = useDirectusUsers();
	const { readItems } = useDirectusItems();
	const { user: currentUser } = useDirectusAuth();
	const { selectedOrg, getOrganizationFilter } = useOrganization();
	const DEFAULT_TEAM_ID = 'org-default'; // Match the constant in useTeams

	const filteredUsers = ref([]);
	const loading = ref(false);

	const fetchFilteredUsers = async (organizationId = null, teamId = null) => {
		try {
			loading.value = true;

			// Ensure current user and their organizations are available
			if (!currentUser.value?.organizations) {
				console.warn('No organizations found for the current user.');
				filteredUsers.value = [];
				return;
			}

			// Use the provided organization ID or fall back to the globally selected one
			const orgId = organizationId || selectedOrg.value;

			// If neither organization nor team is specified, return early
			if (!orgId && !teamId) {
				console.warn('No organization or team specified for filtering users.');
				filteredUsers.value = [];
				return;
			}

			// Build the base filter starting with organization constraint
			const filter = {
				_and: [],
			};

			// Add organization filter if we have an organization ID
			if (orgId) {
				filter._and.push({
					organizations: {
						organizations_id: {
							id: { _eq: orgId },
						},
					},
				});
			} else {
				// If no specific org, use all orgs the current user belongs to
				const currentOrgIds = currentUser.value.organizations.map((org) => org.organizations_id.id);
				filter._and.push({
					organizations: {
						organizations_id: {
							id: { _in: currentOrgIds },
						},
					},
				});
			}

			// Add team filter if a team is specified and it's not the default team
			if (teamId && teamId !== DEFAULT_TEAM_ID) {
				// First get the user IDs from the specified team
				const teamUsers = await readItems('junction_directus_users_teams', {
					filter: {
						teams_id: { _eq: teamId },
					},
					fields: ['directus_users_id'],
				});

				const userIds = teamUsers.map((tu) => tu.directus_users_id);

				// Only apply team filter if we found users in this team
				if (userIds.length > 0) {
					filter._and.push({
						id: { _in: userIds },
					});
				}
			}

			// If _and array is empty, don't use the filter
			if (filter._and.length === 0) {
				delete filter._and;
			}

			console.log('User filter:', filter);

			// Fetch the users with the constructed filter
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
				filter: filter,
			});

			console.log('Fetched filtered users:', users.length);

			// Map the users to a simpler structure
			filteredUsers.value = users.map((user) => ({
				id: user.id,
				first_name: user.first_name,
				last_name: user.last_name,
				email: user.email,
				avatar: user.avatar,
				organizations: user.organizations?.map((org) => ({
					id: org.organizations_id?.id,
					name: org.organizations_id?.name,
				})),
			}));
		} catch (error) {
			console.error('Error fetching filtered users:', error);
			filteredUsers.value = [];
		} finally {
			loading.value = false;
		}
	};

	// Helper function to get users available for a team (excludes users already in the team)
	const getAvailableTeamUsers = async (organizationId, teamId = null) => {
		try {
			loading.value = true;

			// Get all users in the organization
			const allOrgUsers = await readUsers({
				filter: {
					organizations: {
						organizations_id: { _eq: organizationId },
					},
				},
				fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
			});

			// If no team is specified or it's the default team, return all organization users
			if (!teamId || teamId === DEFAULT_TEAM_ID) {
				return allOrgUsers;
			}

			// Get users already in the team
			const teamUsers = await readItems('junction_directus_users_teams', {
				filter: {
					teams_id: { _eq: teamId },
				},
				fields: ['directus_users_id'],
			});

			const teamUserIds = new Set(teamUsers.map((u) => u.directus_users_id));

			// Return users not already in the team
			return allOrgUsers.filter((user) => !teamUserIds.has(user.id));
		} catch (error) {
			console.error('Error fetching available team users:', error);
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
}
