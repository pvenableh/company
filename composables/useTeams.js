// composables/useTeams.js
export const useTeams = () => {
	const { createItem, readItems, deleteItems, updateItem } = useDirectusItems();
	const { readUsers } = useDirectusUsers();
	const { getAvailableTeamUsers } = useFilteredUsers();

	// Role IDs for permission checks
	const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
	const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb';

	const teams = ref([]);
	const organizationUsers = ref([]);
	const visibleTeams = ref([]);
	const loading = ref(false);
	const selectedTeam = useState('selectedTeam', () => null);
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

	// Check if user has admin or client manager role
	const hasAdminAccess = (user) => {
		return user?.role === ADMIN_ROLE_ID || user?.role === CLIENT_MANAGER_ROLE_ID;
	};

	// Get teams for an organization with full user details
	const fetchTeams = async (organizationId) => {
		if (!organizationId) return;

		const { user } = useDirectusAuth();
		loading.value = true;

		try {
			// First, fetch all users in the organization
			await fetchOrganizationUsers(organizationId);

			// Then fetch all teams for the organization
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
					'users.id', // Junction table ID
					'users.is_manager', // Include manager flag
					'users.directus_users_id.id',
					'users.directus_users_id.first_name',
					'users.directus_users_id.last_name',
					'users.directus_users_id.email',
					'users.directus_users_id.avatar',
				],
			});

			console.log(response);

			teams.value = response;

			// Filter teams based on user role and membership
			if (hasAdminAccess(user.value)) {
				// Admin or client manager sees all teams
				visibleTeams.value = [...teams.value];
			} else {
				// Regular users only see teams they're a member of
				visibleTeams.value = teams.value.filter((team) =>
					team.users?.some((member) => member.directus_users_id?.id === user.value?.id),
				);
			}

			// Handle team selection
			tryRestoreSelectedTeam(organizationId);
		} catch (error) {
			console.error('Error fetching teams:', error);
			teams.value = [];
			visibleTeams.value = [];
		} finally {
			loading.value = false;
		}
	};

	// Set selected team with persistence using cookie
	const setTeam = (teamId) => {
		if (teamId === selectedTeam.value) {
			clearTeam();
		} else {
			selectedTeam.value = teamId; // Can be null or a real team ID
			const cookie = useCookie('selectedTeam', {
				maxAge: 60 * 60 * 24 * 30, // 30 days
				path: '/',
				sameSite: 'lax',
			});
			cookie.value = teamId;
		}
	};

	// Clear selected team (sets to null)
	const clearTeam = () => {
		selectedTeam.value = null;
		const cookie = useCookie('selectedTeam');
		cookie.value = null;
	};

	// Try to restore selected team from cookie
	const tryRestoreSelectedTeam = (organizationId) => {
		try {
			const savedTeam = useCookie('selectedTeam').value;

			// If there's a saved team ID and it exists in the visible teams list, use it
			if (savedTeam && visibleTeams.value.some((team) => team.id === savedTeam)) {
				selectedTeam.value = savedTeam;
				return;
			}

			// If no valid saved team, don't automatically select one - remain null
			selectedTeam.value = null;
		} catch (err) {
			console.warn('Error restoring saved team:', err);
			selectedTeam.value = null;
		}
	};

	// Get team filter for queries
	const getTeamFilter = () => {
		// If no team is selected, return empty filter
		if (!selectedTeam.value) {
			return {}; // No team filter
		}

		// Get users in the selected team
		const team = teams.value.find((t) => t.id === selectedTeam.value);
		if (!team || !team.users?.length) return {};

		const teamUserIds = team.users.map((u) => u.directus_users_id.id);

		return {
			assigned_to: {
				directus_users_id: {
					id: { _in: teamUserIds },
				},
			},
		};
	};

	// Computed for current team details
	const currentTeam = computed(() => {
		if (!selectedTeam.value) return null;
		return teams.value.find((team) => team.id === selectedTeam.value);
	});

	// Computed for users in current team
	const currentTeamUsers = computed(() => {
		if (!selectedTeam.value) return [];

		const team = teams.value.find((t) => t.id === selectedTeam.value);
		return team?.users?.map((u) => u.directus_users_id) || [];
	});

	// Check if a user is a manager of a specific team
	const isTeamManager = (teamId, userId) => {
		const { user } = useDirectusAuth();
		const currentUserId = userId || user.value?.id;
		if (!currentUserId) return false;

		const team = teams.value.find((t) => t.id === teamId);
		return team?.users?.some((u) => u.directus_users_id?.id === currentUserId && u.is_manager === true);
	};

	// Check if user can manage a team (is manager or has admin role)
	const canManageTeam = (teamId) => {
		const { user } = useDirectusAuth();
		if (hasAdminAccess(user.value)) return true;
		return isTeamManager(teamId);
	};

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

			// Add team members with manager status
			if (teamData.users?.length) {
				await Promise.all(
					teamData.users.map((userData) =>
						createItem('junction_directus_users_teams', {
							teams_id: team.id,
							directus_users_id: userData.id,
							is_manager: userData.isManager || false,
						}),
					),
				);
			} else {
				// If no users specified, add current user as manager by default
				const { user } = useDirectusAuth();
				if (user.value) {
					await createItem('junction_directus_users_teams', {
						teams_id: team.id,
						directus_users_id: user.value.id,
						is_manager: true,
					});
				}
			}

			// Refresh the teams list
			await fetchTeams(organizationId);
			return team;
		} catch (error) {
			console.error('Error creating team:', error);
			throw error;
		}
	};

	// Update existing team
	const updateTeam = async (teamId, teamData, organizationId) => {
		try {
			await updateItem('teams', teamId, {
				name: teamData.name,
				description: teamData.description,
			});

			// Refresh the teams list
			await fetchTeams(organizationId);
		} catch (error) {
			console.error('Error updating team:', error);
			throw error;
		}
	};

	// Delete a team
	const deleteTeam = async (teamId, organizationId) => {
		try {
			await deleteItem('teams', teamId);

			// Clear selection if the deleted team was selected
			if (selectedTeam.value === teamId) {
				clearTeam();
			}

			// Refresh the teams list
			await fetchTeams(organizationId);
		} catch (error) {
			console.error('Error deleting team:', error);
			throw error;
		}
	};

	// Add users to team
	const addUsersToTeam = async (teamId, userIds, organizationId, isManager = false) => {
		if (!teamId || !userIds?.length || !organizationId) return;

		try {
			const promises = userIds.map((userId) =>
				createItem('junction_directus_users_teams', {
					directus_users_id: userId,
					teams_id: teamId,
					is_manager: isManager,
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
		if (!teamId || !userId || !organizationId) return;

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
		visibleTeams: readonly(visibleTeams),
		loading: readonly(loading),
		selectedTeam: readonly(selectedTeam),
		currentTeam,
		currentTeamUsers,
		fetchTeams,
		createTeam,
		updateTeam,
		deleteTeam,
		addUsersToTeam,
		removeUserFromTeam,
		getAvailableTeamUsers,
		setTeam,
		clearTeam,
		getTeamFilter,
		fetchOrganizationUsers,
		organizationUsers: readonly(organizationUsers),
		isTeamManager,
		canManageTeam,
		hasAdminAccess,
		ADMIN_ROLE_ID,
		CLIENT_MANAGER_ROLE_ID,
	};
};
