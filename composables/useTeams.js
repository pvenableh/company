// composables/useTeams.js
export const useTeams = () => {
	const { createItem, readItems, deleteItems } = useDirectusItems();
	const { readUsers } = useDirectusUsers();
	const { getAvailableTeamUsers } = useFilteredUsers();

	// Special constant for the default "all users" team ID
	const DEFAULT_TEAM_ID = 'org-default';

	const teams = ref([]);
	const organizationUsers = ref([]);
	const loading = ref(false);
	const selectedTeam = useState('selectedTeam', () => DEFAULT_TEAM_ID);
	const isInitialized = useState('teamsIsInitialized', () => false);

	// Get all users for an organization
	const fetchOrganizationUsers = async (organizationId) => {
		if (!organizationId) return [];

		try {
			const users = await readUsers({
				filter: {
					organizations: {
						organizations_id: { _eq: organizationId },
					},
				},
				fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
			});

			organizationUsers.value = users;
			return users;
		} catch (error) {
			console.error('Error fetching organization users:', error);
			return [];
		}
	};

	// Get teams for an organization with full user details
	const fetchTeams = async (organizationId) => {
		if (!organizationId) return;

		loading.value = true;
		try {
			// First, fetch all users in the organization
			await fetchOrganizationUsers(organizationId);

			// Then fetch regular teams
			const response = await readItems('teams', {
				filter: {
					organization: { _eq: organizationId },
				},
				fields: [
					'id',
					'name',
					'description',
					'organization',
					'organization.id',
					'users.directus_users_id.id',
					'users.directus_users_id.first_name',
					'users.directus_users_id.last_name',
					'users.directus_users_id.email',
					'users.directus_users_id.avatar',
				],
			});

			teams.value = response;
			tryRestoreSelectedTeam(organizationId);
		} catch (error) {
			console.error('Error fetching teams:', error);
		} finally {
			loading.value = false;
		}
	};

	// Set selected team with persistence using cookie
	const setTeam = (teamId) => {
		selectedTeam.value = teamId; // Can be null, DEFAULT_TEAM_ID, or a real team ID
		const cookie = useCookie('selectedTeam', {
			maxAge: 60 * 60 * 24 * 30, // 30 days
			path: '/',
			sameSite: 'lax',
		});
		cookie.value = teamId;
	};

	// Clear selected team (sets to default)
	const clearTeam = () => {
		selectedTeam.value = DEFAULT_TEAM_ID;
		const cookie = useCookie('selectedTeam');
		cookie.value = DEFAULT_TEAM_ID;
	};

	// Try to restore selected team from cookie
	const tryRestoreSelectedTeam = (organizationId) => {
		try {
			const savedTeam = useCookie('selectedTeam').value;

			// If there's a saved team ID and it exists in the teams list, use it
			if (savedTeam && teams.value.some((team) => team.id === savedTeam)) {
				selectedTeam.value = savedTeam;
				return;
			}

			// If no valid saved team, check if we have any teams
			if (teams.value.length === 0) {
				// No teams exist, set to default
				selectedTeam.value = DEFAULT_TEAM_ID;
			} else {
				// Teams exist but saved team wasn't found, set to first team
				selectedTeam.value = teams.value[0].id;
			}
		} catch (err) {
			console.warn('Error restoring saved team:', err);
			selectedTeam.value = DEFAULT_TEAM_ID;
		}
	};

	// Get team filter for queries
	const getTeamFilter = () => {
		// If default team is selected or no team is selected, return empty filter
		if (!selectedTeam.value || selectedTeam.value === DEFAULT_TEAM_ID) {
			return {}; // No team filter means all org users
		}

		return {
			teams: {
				_some: {
					teams_id: { _eq: selectedTeam.value },
				},
			},
		};
	};

	// Check if the selected team is the default virtual team
	const isDefaultTeam = computed(() => {
		return selectedTeam.value === DEFAULT_TEAM_ID;
	});

	// Computed for current team details
	const currentTeam = computed(() => {
		// If default team is selected, return virtual team object
		if (selectedTeam.value === DEFAULT_TEAM_ID) {
			return {
				id: DEFAULT_TEAM_ID,
				name: 'Default Team',
				description: 'All users in this organization',
				isVirtual: true,
			};
		}

		// Otherwise find the real team
		if (!selectedTeam.value) return null;
		return teams.value.find((team) => team.id === selectedTeam.value);
	});

	// Computed for users based on selection (team users or all org users)
	const currentUsers = computed(() => {
		// If default team or no team is selected, return all organization users
		if (!selectedTeam.value || selectedTeam.value === DEFAULT_TEAM_ID) {
			return organizationUsers.value;
		}

		// Otherwise return just the team's users
		const team = teams.value.find((t) => t.id === selectedTeam.value);
		return team?.users?.map((u) => u.directus_users_id) || [];
	});

	// Get all teams with the virtual default team included
	const allTeams = computed(() => {
		const virtualDefaultTeam = {
			id: DEFAULT_TEAM_ID,
			name: 'Default Team',
			description: 'All users in this organization',
			isVirtual: true,
			users: organizationUsers.value.map((user) => ({ directus_users_id: user })),
		};

		return [virtualDefaultTeam, ...teams.value];
	});

	// Create a new team
	const createTeam = async (organizationId, teamData) => {
		try {
			// Create the team
			const team = await createItem('teams', {
				name: teamData.name,
				description: teamData.description,
				organization: organizationId,
				status: 'published',
			});

			// Add team members
			if (teamData.users?.length) {
				await Promise.all(
					teamData.users.map((userId) =>
						createItem('junction_directus_users_teams', {
							teams_id: team.id,
							directus_users_id: userId,
						}),
					),
				);
			}

			// Refresh the teams list
			await fetchTeams(organizationId);
			return team;
		} catch (error) {
			console.error('Error creating team:', error);
			throw error;
		}
	};

	// Add users to team
	const addUsersToTeam = async (teamId, userIds, organizationId) => {
		// Can't add users to the virtual default team
		if (teamId === DEFAULT_TEAM_ID || !teamId || !userIds?.length || !organizationId) return;

		try {
			const promises = userIds.map((userId) =>
				createItem('junction_directus_users_teams', {
					directus_users_id: userId,
					teams_id: teamId,
				}),
			);
			await Promise.all(promises);

			// Refresh teams data
			await fetchTeams(organizationId);
		} catch (error) {
			console.error('Error adding users to team:', error);
			throw error;
		}
	};

	// Remove user from team
	const removeUserFromTeam = async (teamId, userId, organizationId) => {
		// Can't remove users from the virtual default team
		if (teamId === DEFAULT_TEAM_ID || !teamId || !userId || !organizationId) return;

		try {
			await deleteItems('junction_directus_users_teams', {
				filter: {
					teams_id: { _eq: teamId },
					directus_users_id: { _eq: userId },
				},
			});

			// Refresh teams data
			await fetchTeams(organizationId);
		} catch (error) {
			console.error('Error removing user from team:', error);
			throw error;
		}
	};

	return {
		teams: readonly(teams),
		allTeams,
		loading: readonly(loading),
		selectedTeam: readonly(selectedTeam),
		currentTeam,
		currentUsers,
		isDefaultTeam,
		DEFAULT_TEAM_ID,
		fetchTeams,
		createTeam,
		addUsersToTeam,
		removeUserFromTeam,
		getAvailableTeamUsers,
		setTeam,
		clearTeam,
		getTeamFilter,
		fetchOrganizationUsers,
		organizationUsers: readonly(organizationUsers),
	};
};
