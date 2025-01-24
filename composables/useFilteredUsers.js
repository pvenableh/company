export default function useFilteredUsers() {
	const { readUsers } = useDirectusUsers();
	const { user: currentUser } = useDirectusAuth();
	const { selectedOrg, getOrganizationFilter } = useOrganization();

	const filteredUsers = ref([]);
	const loading = ref(false);

	const fetchFilteredUsers = async () => {
		try {
			loading.value = true;

			// Ensure current user and their organizations are available
			if (!currentUser.value?.organizations) {
				console.warn('No organizations found for the current user.');
				filteredUsers.value = [];
				return;
			}

			// Get the organization filter from the composable
			const orgFilter = getOrganizationFilter();

			// Get current organization ids (only for the current user)
			const currentOrgIds = currentUser.value.organizations.map((org) => org.organizations_id.id);

			// If selectedOrg is set, filter users by that organization only
			const filter = {
				_and: [
					{
						organizations: {
							organizations_id: {
								id: selectedOrg.value
									? { _eq: selectedOrg.value } // Use _eq for single selectedOrg
									: { _in: currentOrgIds }, // Use _in if no selectedOrg or for multiple organizations
							},
						},
					},
					// ...(orgFilter ? [orgFilter] : []), // Merge the organization-specific filter if it exists
				],
			};

			console.log(filter);

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

			console.log('Fetched users:', users);

			filteredUsers.value = users.map((user) => ({
				id: user.id,
				first_name: user.first_name,
				last_name: user.last_name,
				email: user.email,
				avatar: user.avatar,
				organizations: user.organizations?.map((org) => ({
					id: org.id,
					name: org.name,
				})),
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
