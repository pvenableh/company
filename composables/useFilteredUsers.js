export default function useFilteredUsers() {
	const { readUsers } = useDirectusUsers();
	const { user: currentUser } = useDirectusAuth();

	const filteredUsers = ref([]);
	const loading = ref(false);

	const fetchFilteredUsers = async (organizationId = null) => {
		try {
			loading.value = true;

			// Ensure current user and their organizations are available
			if (!currentUser.value?.organizations) {
				console.warn('No organizations found for the current user.');
				filteredUsers.value = [];
				return;
			}

			let orgFilter;

			if (organizationId) {
				// If specific organization is provided, filter by that
				orgFilter = {
					organizations: {
						organizations_id: {
							id: {
								_eq: organizationId,
							},
						},
					},
				};
			} else {
				// Otherwise use the original multiple organizations filter
				const currentOrgIds = currentUser.value.organizations.map((org) => org.organizations_id.id);
				const allOrgIds = [...currentOrgIds, '423f5e7e-e14c-4348-9fea-89ba5c6b9d96'];

				orgFilter = {
					organizations: {
						organizations_id: {
							id: {
								_in: allOrgIds,
							},
						},
					},
				};
			}

			// Fetch users with the determined filter
			const users = await readUsers({
				fields: ['id', 'first_name', 'last_name', 'email', 'avatar', 'organizations.id'],
				filter: orgFilter,
			});

			filteredUsers.value = users.map((user) => ({
				...user,
				label: user.id === currentUser.value.id ? 'You' : `${user.first_name} ${user.last_name}`,
			}));
		} catch (error) {
			console.error('Error fetching filtered users:', error);
			filteredUsers.value = [];
		} finally {
			loading.value = false;
		}
	};

	return {
		filteredUsers,
		fetchFilteredUsers,
		loading,
	};
}
