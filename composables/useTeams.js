// composables/useTeams.js
export const useTeams = () => {
	const teamItems = useDirectusItems('teams');
	const junctionItems = useDirectusItems('junction_directus_users_teams');
	const { readUsers } = useDirectusUsers();
	const nuxtApp = useNuxtApp();

	// Role IDs and helpers from shared composable
	const { ADMIN_ROLE_ID, CLIENT_MANAGER_ROLE_ID, hasAdminAccess: _hasAdminAccess, getRoleId } = useRole();
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

	const { user } = useDirectusAuth();

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
	const hasAdminAccess = (user) => _hasAdminAccess(user);

	// Get teams for an organization with full user details
	const fetchTeams = async (organizationId) => {
		if (organizationId === null && hasAdminAccess(user.value)) {
			// console.log('useTeams: Admin in "All Organizations" mode, clearing teams');
			teams.value = [];
			visibleTeams.value = [];
			clearTeam();
			return [];
		}

		if (!organizationId) {
			//  console.warn('fetchTeams called without organizationId');
			return;
		}

		// Skip if already fetching for this org
		if (loading.value && lastFetchedOrg.value === organizationId) {
			//  console.log('Already fetching teams for this org, skipping');
			return;
		}

		loading.value = true;
		lastFetchedOrg.value = organizationId;
		error.value = null;

		try {
			// 	console.log('useTeams: Fetching teams for organization:', organizationId);

			// First, fetch all users in the organization
			await fetchOrganizationUsers(organizationId);

			// Then fetch all teams for the organization
			const response = await teamItems.list({
				filter: {
					organization: { _eq: organizationId },
					active: { _neq: false },
				},
				fields: [
					'id',
					'name',
					'description',
					'organization',
					'icon',
					'active',
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

			// 	console.log(`useTeams: Fetched ${response.length} teams for org ${organizationId}`);

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

			// console.log(`useTeams: Visible teams: ${visibleTeams.value.length}`);

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
		// console.log('useTeams: Team set to:', teamId);
	};

	// Clear selected team (sets to null)
	const clearTeam = () => {
		selectedTeam.value = null;
		teamCookie.value = null;
		setLocalStorageTeam(null);
		//  console.log('useTeams: Team cleared');
	};

	// Check if a teamId is valid for the current organization
	const isValidTeamForOrg = (teamId) => {
		// null is valid for all users (See All / All Teams)
		if (!teamId) {
			return true;
		}

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

			// console.log('useTeams: Trying to restore team, saved team ID:', savedTeam);
			// console.log('useTeams: visibleTeams count:', visibleTeams.value.length);

			// If there are no visible teams, clear selection and return
			if (visibleTeams.value.length === 0) {
				// console.log('useTeams: No visible teams available, clearing selection');
				selectedTeam.value = null;
				return;
			}

			// For regular users, restore saved team or default to first team
			if (!hasAdminAccess(user.value)) {
				if (savedTeam && isValidTeamForOrg(savedTeam)) {
					// console.log('useTeams: Restoring saved team for regular user:', savedTeam);
					selectedTeam.value = savedTeam;
				} else if (savedTeam === null || savedTeam === 'null') {
					// User previously selected "See All" - keep it
					selectedTeam.value = null;
				} else {
					// No saved team, select the first team they have access to
					const firstTeamId = visibleTeams.value[0]?.id;
					// console.log('useTeams: Setting regular user to first visible team:', firstTeamId);
					setTeam(firstTeamId);
				}
				return;
			}

			// For admins, allow null team (All Teams) or any valid team
			if (savedTeam && isValidTeamForOrg(savedTeam)) {
				// console.log('useTeams: Restoring saved team for admin:', savedTeam);
				selectedTeam.value = savedTeam;
				return;
			} else if (savedTeam) {
				// console.log('useTeams: Saved team not found in visible teams, not restoring');
				// Important: Don't auto-select a team if the saved one is invalid
				selectedTeam.value = null;
				return;
			}

			// If no valid saved team for admin, don't select any team by default
			// console.log('useTeams: No saved team or invalid saved team for admin, setting to null');
			selectedTeam.value = null;
		} catch (err) {
			// console.warn('Error restoring saved team:', err);
			selectedTeam.value = null;
		}
	};

	// Get team filter for queries
	const getTeamFilter = () => {
		// If no organization is selected, return empty filter
		if (!selectedOrg.value) {
			return {}; // No team filter
		}

		// For regular users, apply team filter even when no team is explicitly selected
		// This ensures they only see content from their teams
		if (!selectedTeam.value && !hasAdminAccess(user.value) && visibleTeams.value.length > 0) {
			// Create a filter for all teams they're a member of
			const teamUserIds = visibleTeams.value.flatMap((team) => team.users?.map((u) => u.directus_users_id.id) || []);

			// Remove duplicates
			const uniqueUserIds = [...new Set(teamUserIds)];

			if (uniqueUserIds.length > 0) {
				return {
					assigned_to: {
						directus_users_id: {
							id: { _in: uniqueUserIds },
						},
					},
				};
			}
		}

		// If a specific team is selected, filter by that team's users
		if (selectedTeam.value) {
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
		}

		// For admins with no team selected, return empty filter
		return {};
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
		const currentUserId = userId || user.value?.id;
		if (!currentUserId) return false;

		const team = teams.value.find((t) => t.id === teamId);
		return team?.users?.some((u) => u.directus_users_id?.id === currentUserId && u.is_manager === true);
	};

	// Check if user can manage a team (is manager or has admin role)
	const canManageTeam = (teamId) => {
		if (hasAdminAccess(user.value)) return true;
		return isTeamManager(teamId);
	};

	// Check if user is on a team
	const isOnTeam = (team) => {
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
			const team = await teamItems.create({
				name: teamData.name,
				description: teamData.description,
				organization: organizationId,
				status: 'published',
				active: teamData.active !== false,
			});

			// Add team members with manager status
			if (teamData.users?.length) {
				await Promise.all(
					teamData.users.map((userData) =>
						junctionItems.create({
							teams_id: team.id,
							directus_users_id: userData.id,
							is_manager: userData.isManager || false,
						}),
					),
				);
			} else {
				// If no users specified, add current user as manager by default
				if (user.value) {
					await junctionItems.create({
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
			await teamItems.update(teamId, {
				name: teamData.name,
				description: teamData.description,
				active: teamData.active !== false,
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
			await teamItems.remove(teamId);

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
				junctionItems.create({
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
			const toDelete = await junctionItems.list({
				filter: {
					teams_id: { _eq: teamId },
					directus_users_id: { _eq: userId },
				},
				fields: ['id'],
			});
			if (toDelete.length) await junctionItems.remove(toDelete.map(r => r.id));

			// Refresh teams data
			await fetchTeams(organizationId);
		} catch (error) {
			console.error('Error removing user from team:', error);
			throw error;
		}
	};

	// Should the UI show the "All Teams" option
	const showAllTeamsOption = () => {
		return hasAdminAccess(user.value);
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
				//  console.log('Team changed in another tab:', newTeamId);

				// Check if the new team ID is valid within the current context
				if (newTeamId && isValidTeamForOrg(newTeamId)) {
					selectedTeam.value = newTeamId;
				} else if (!newTeamId) {
					// Allow null for all users (See All)
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

	// Re-fetch teams when user auth hydrates (fixes empty team list on initial load)
	watch(
		() => user.value?.id,
		async (newUserId, oldUserId) => {
			if (newUserId && !oldUserId && selectedOrg.value) {
				// User just became available — re-fetch teams so visibility filter works
				await fetchTeams(selectedOrg.value);
			}
		},
	);

	// Watch for organization changes
	watch(
		() => selectedOrg.value,
		async (newOrg, oldOrg) => {
			// console.log('useTeams: Organization changed from', oldOrg, 'to', newOrg);

			if (newOrg !== oldOrg) {
				// If switching to a new valid organization
				if (newOrg) {
					// console.log('useTeams: Fetching teams for new organization:', newOrg);
					clearTeam(); // Clear team selection before fetching new teams
					await fetchTeams(newOrg);
				} else {
					// Handle "All Organizations" mode for admins
					// console.log('useTeams: Admin in "All Organizations" mode');

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
			// console.log('useTeams: App mounted hook called');
			if (selectedOrg?.value) {
				fetchTeams(selectedOrg.value);
			}

			// Set up storage listener
			setupStorageListener();
		});

		nuxtApp.hook('app:beforeUnmount', () => {
			// console.log('useTeams: App before unmount hook called');
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
		showAllTeamsOption,

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
