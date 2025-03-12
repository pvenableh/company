// composables/useTeams.js
export const useTeams = () => {
	const { createItem, readItems, deleteItems, updateItem } = useDirectusItems();
	const { readUsers } = useDirectusUsers();
	const nuxtApp = useNuxtApp();

	// Role IDs for permission checks
	const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
	const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb';
	const DEFAULT_TEAM_ID = 'org-default'; // Virtual team ID for "Default Team"

	// State
	const teams = ref([]);
	const visibleTeams = ref([]);
	const organizationUsers = ref([]);
	const loading = ref(false);
	const error = ref(null);
	const selectedTeam = useState('selectedTeam', () => null);
	const lastFetchedOrg = ref(null);
	const storageListener = ref(null);

	const { selectedOrg } = useOrganization();

	// --- Cookie and localStorage ---
	const teamCookie = useCookie('selectedTeam', {
		maxAge: 60 * 60 * 24 * 30, // 30 days
		path: '/',
		sameSite: 'lax',
	});

	const getLocalStorageTeam = () => {
		if (import.meta.client) {
			return localStorage.getItem('selectedTeamId');
		}
		return null;
	};

	const setLocalStorageTeam = (teamId) => {
		if (!import.meta.client) return;

		if (teamId) {
			localStorage.setItem('selectedTeamId', teamId);
		} else {
			localStorage.removeItem('selectedTeamId');
		}
	};

	// --- Organization Handling ---

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
				fields: ['id', 'first_name', 'last_name', 'email', 'avatar', 'role'],
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
		if (!user) return false;
		return user?.role === ADMIN_ROLE_ID || user?.role === CLIENT_MANAGER_ROLE_ID;
	};

	// Get teams for an organization with full user details
	const fetchTeams = async (organizationId) => {
		if (organizationId === null && hasAdminAccess(user.value)) {
			console.log('useTeams: Admin in "All Organizations" mode, clearing teams');
			teams.value = [];
			visibleTeams.value = [];
			clearTeam();
			return [];
		}

		if (!organizationId) {
			console.warn('fetchTeams called without organizationId');
			return;
		}

		const { user } = useDirectusAuth();

		// Skip if already fetching for this org
		if (loading.value && lastFetchedOrg.value === organizationId) {
			console.log('Already fetching teams for this org, skipping');
			return;
		}

		loading.value = true;
		lastFetchedOrg.value = organizationId;
		error.value = null;

		try {
			console.log('useTeams: Fetching teams for organization:', organizationId);

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
					'icon',
					'organization.id',
					'users.id', // Junction table ID
					'users.is_manager', // Include manager flag
					'users.directus_users_id.id',
					'users.directus_users_id.first_name',
					'users.directus_users_id.last_name',
					'users.directus_users_id.email',
					'users.directus_users_id.avatar',
					'users.directus_users_id.role.id',
				],
			});

			console.log(`useTeams: Fetched ${response.length} teams for org ${organizationId}`);

			teams.value = response || [];

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

			console.log(`useTeams: Visible teams: ${visibleTeams.value.length}`);

			// Try to restore selected team after fetching
			await tryRestoreSelectedTeam(organizationId);

			return teams.value;
		} catch (err) {
			console.error('Error fetching teams:', err);
			error.value = err.message || 'Failed to fetch teams';
			teams.value = [];
			visibleTeams.value = [];
			return [];
		} finally {
			loading.value = false;
		}
	};

	// Set selected team with persistence using cookie and localStorage
	const setTeam = (teamId) => {
		selectedTeam.value = teamId;
		teamCookie.value = teamId;
		setLocalStorageTeam(teamId);
		console.log('useTeams: Team set to:', teamId);
	};

	// Clear selected team (sets to null)
	const clearTeam = () => {
		selectedTeam.value = null;
		teamCookie.value = null;
		setLocalStorageTeam(null);
		console.log('useTeams: Team cleared');
	};

	// Check if a teamId is valid for the current organization
	const isValidTeamForOrg = (teamId) => {
		if (!teamId) return true; // null is always valid (All Teams)
		return visibleTeams.value.some((team) => team.id === teamId);
	};

	// Try to restore selected team from cookie and localStorage
	const tryRestoreSelectedTeam = async (organizationId) => {
		try {
			let savedTeam = teamCookie.value;
			const localStorageTeam = getLocalStorageTeam();

			// Prioritize localStorage if available
			if (localStorageTeam) {
				savedTeam = localStorageTeam;
			}

			console.log('useTeams: Trying to restore team, saved team ID:', savedTeam);
			console.log('useTeams: visibleTeams count:', visibleTeams.value.length);

			// If there's a saved team ID and it exists in the visible teams list, use it
			if (savedTeam && isValidTeamForOrg(savedTeam)) {
				console.log('useTeams: Restoring saved team:', savedTeam);
				selectedTeam.value = savedTeam;
				return;
			} else if (savedTeam) {
				console.log('useTeams: Saved team not found in visible teams, not restoring');
				// Important: Don't auto-select a team if the saved one is invalid
				selectedTeam.value = null;
				return;
			}

			// If no valid saved team, don't select any team by default
			console.log('useTeams: No saved team or invalid saved team, setting to null');
			selectedTeam.value = null;
		} catch (err) {
			console.warn('Error restoring saved team:', err);
			selectedTeam.value = null;
		}
	};

	// Get team filter for queries
	const getTeamFilter = () => {
		// If no team is selected or no organization is selected, return empty filter
		if (!selectedTeam.value || !selectedOrg.value) {
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

	// Computed for all teams (includes both visible and invisible)
	const allTeams = computed(() => {
		return teams.value;
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

	// Check if user is on a team
	const isOnTeam = (team) => {
		const { user } = useDirectusAuth();
		if (!user.value || !team.users) return false;
		return team.users.some((u) => u.directus_users_id?.id === user.value.id);
	};

	// Get team members
	const getTeamMembers = (team) => {
		return team.users || [];
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
			await deleteItems('teams', teamId);

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

	// --- Cross-Tab Synchronization ---
	// Setup storage event listener for cross-tab coordination
	const setupStorageListener = () => {
		if (!import.meta.client) return () => {};

		// Cleanup previous listener if exists
		if (storageListener.value) {
			window.removeEventListener('storage', storageListener.value);
			storageListener.value = null;
		}

		// Set up storage event listener
		const listener = (event) => {
			if (event.key === 'selectedTeamId') {
				const newTeamId = event.newValue;
				console.log('Team changed in another tab:', newTeamId);

				// Check if the new team ID is valid within the current context
				if (newTeamId && isValidTeamForOrg(newTeamId)) {
					selectedTeam.value = newTeamId;
				} else if (!newTeamId) {
					selectedTeam.value = null;
				} else {
					console.warn(
						'Team ID from localStorage is not valid in this context. It might be from a different organization or deleted.',
					);
				}
			}
		};

		window.addEventListener('storage', listener);
		storageListener.value = listener;

		// Return cleanup function
		return () => {
			if (storageListener.value) {
				window.removeEventListener('storage', storageListener.value);
				storageListener.value = null;
			}
		};
	};

	// Watch for organization changes
	watch(
		() => selectedOrg.value,
		async (newOrg, oldOrg) => {
			console.log('useTeams: Organization changed from', oldOrg, 'to', newOrg);

			if (newOrg !== oldOrg) {
				// If switching to a new valid organization
				if (newOrg) {
					console.log('useTeams: Fetching teams for new organization:', newOrg);
					clearTeam(); // Clear team selection before fetching new teams
					await fetchTeams(newOrg);
				} else {
					// Handle "All Organizations" mode for admins
					console.log('useTeams: Admin in "All Organizations" mode');

					// Clear team data but don't display error messages
					teams.value = [];
					visibleTeams.value = [];
					clearTeam();
				}
			}
		},
		{ immediate: false },
	);

	// Set up lifecycle hooks via the Nuxt app if available
	if (import.meta.client && nuxtApp) {
		nuxtApp.hook('app:mounted', () => {
			console.log('useTeams: App mounted hook called');
			if (selectedOrg?.value) {
				fetchTeams(selectedOrg.value);
			}

			// Set up storage listener
			setupStorageListener();
		});

		nuxtApp.hook('app:beforeUnmount', () => {
			console.log('useTeams: App before unmount hook called');
			// Clean up storage listener
			if (storageListener.value) {
				window.removeEventListener('storage', storageListener.value);
				storageListener.value = null;
			}
		});
	}

	return {
		// State
		teams: readonly(teams),
		visibleTeams: readonly(visibleTeams),
		loading: readonly(loading),
		error: readonly(error),
		selectedTeam: readonly(selectedTeam),
		allTeams: readonly(allTeams),
		lastFetchedOrg: readonly(lastFetchedOrg),
		DEFAULT_TEAM_ID,

		// Core functions
		fetchTeams,
		setTeam,
		clearTeam,
		getTeamFilter,

		// Team relationship functions
		createTeam,
		updateTeam,
		deleteTeam,
		addUsersToTeam,
		removeUserFromTeam,

		// User relationship functions
		fetchOrganizationUsers,
		organizationUsers: readonly(organizationUsers),

		// Helper functions
		isTeamManager,
		canManageTeam,
		hasAdminAccess,
		isOnTeam,
		getTeamMembers,
		isValidTeamForOrg,

		// Role constants
		ADMIN_ROLE_ID,
		CLIENT_MANAGER_ROLE_ID,

		// Computed values
		currentTeam,
		currentTeamUsers,

		// Cross-tab synchronization
		setupStorageListener,
	};
};
