export default function useFilteredUsers() {
	const { readUsers } = useDirectusUsers();
	const { user: currentUser } = useDirectusAuth();
	const { selectedOrg, getOrganizationFilter } = useOrganization(); // Import selectedOrg and getOrganizationFilter

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

			// Use getOrganizationFilter to filter users by the selected organization
			const orgFilter = getOrganizationFilter();
			const currentOrgIds = currentUser.value.organizations.map((org) => org.organizations_id.id);
			const allOrgIds = [...currentOrgIds, '423f5e7e-e14c-4348-9fea-89ba5c6b9d96'];

			const filter = {
				_and: [
					{
						organizations: {
							organizations_id: {
								id: {
									_in: selectedOrg.value ? [selectedOrg.value] : allOrgIds,
								},
							},
						},
					},
					// Uncomment if you want to exclude the current user
					// {
					//   id: {
					//     _neq: currentUser.value.id,
					//   },
					// },
				],
				...orgFilter, // Merge the organization-specific filter
			};

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
					id: org.organizations_id.id,
					name: org.organizations_id.name,
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
