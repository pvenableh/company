// composables/useFilteredUsers.js

export const useFilteredUsers = () => {
	const { readUsers } = useDirectusUsers();
	const junctionItems = useDirectusItems('junction_directus_users_teams');
	const membershipItems = useDirectusItems('org_memberships');
	const { user: sessionUser, loggedIn } = useUserSession();
	const currentUser = computed(() => {
		return loggedIn.value ? sessionUser.value ?? null : null;
	});
	const { selectedOrg } = useOrganization();

	// Use a consistent DEFAULT_TEAM_ID
	const DEFAULT_TEAM_ID = 'org-default'; // Hardcoded fallback if config not available

	const filteredUsers = ref([]);
	const loading = ref(false);

	/**
	 * Fetch users for mention suggestions, scoped by organization, team, and client.
	 *
	 * @param {string|null} organizationId - Organization to scope users to (falls back to selectedOrg)
	 * @param {string|null} teamId - Optional team filter (narrows to team members)
	 * @param {string|null} clientId - Optional client filter (includes client-role users from org_memberships)
	 */
	const fetchFilteredUsers = async (organizationId = null, teamId = null, clientId = null) => {
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

			// Map the org/team users to the required format (these are internal users)
			const orgUsers = users.map((user) => ({
				id: user.id,
				first_name: user.first_name || '',
				last_name: user.last_name || '',
				email: user.email || '',
				avatar: user.avatar,
				label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User',
				value: user.id,
				type: 'internal',
				organizations:
					user.organizations?.map((org) => ({
						id: org.organizations_id?.id,
						name: org.organizations_id?.name,
					})) || [],
			}));

			// If a clientId is provided, also fetch client-role users via org_memberships
			let clientUsers = [];
			if (clientId && clientId !== 'org') {
				try {
					clientUsers = await fetchClientUsers(orgId, clientId, orgUsers);
				} catch (err) {
					console.warn('Failed to fetch client users for mentions:', err);
				}
			}

			// Merge: org users first, then client users not already in the list
			const orgUserIds = new Set(orgUsers.map((u) => u.id));
			const dedupedClientUsers = clientUsers.filter((u) => !orgUserIds.has(u.id));

			filteredUsers.value = [...orgUsers, ...dedupedClientUsers];
		} catch (error) {
			console.error('Error in fetchFilteredUsers:', error);
			filteredUsers.value = []; // Reset on error
		} finally {
			loading.value = false;
		}
	};

	/**
	 * Fetch users who are associated with a specific client via org_memberships.
	 * These are typically external client-role users who should be mentionable
	 * when working on that client's tickets/projects.
	 */
	const fetchClientUsers = async (orgId, clientId, existingUsers = []) => {
		const existingIds = new Set(existingUsers.map((u) => u.id));

		// Query org_memberships for users assigned to this client
		const memberships = await membershipItems.list({
			filter: {
				organization: { _eq: orgId },
				client: { _eq: clientId },
				status: { _eq: 'active' },
			},
			fields: [
				'user.id',
				'user.first_name',
				'user.last_name',
				'user.email',
				'user.avatar',
				'role.name',
				'client.name',
			],
		});

		return memberships
			.filter((m) => m.user && !existingIds.has(typeof m.user === 'object' ? m.user.id : m.user))
			.map((m) => {
				const user = m.user;
				const clientName = typeof m.client === 'object' ? m.client?.name : null;
				const roleName = typeof m.role === 'object' ? m.role?.name : null;
				return {
					id: user.id,
					first_name: user.first_name || '',
					last_name: user.last_name || '',
					email: user.email || '',
					avatar: user.avatar,
					label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User',
					value: user.id,
					type: 'client',
					clientName: clientName || null,
					roleName: roleName || null,
					organizations: [],
				};
			});
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
