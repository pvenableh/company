export default function useFilteredUsers() {
	const { readUsers } = useDirectusUsers();
	const { user: currentUser } = useDirectusAuth();

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

			// Get the organization IDs the current user belongs to
			const currentOrgIds = currentUser.value.organizations.map((org) => org.organizations_id.id);

			// Add the specific organization ID to the list
			const allOrgIds = [...currentOrgIds, '423f5e7e-e14c-4348-9fea-89ba5c6b9d96'];

			// Fetch users filtered by these organization IDs
			const users = await readUsers({
				fields: ['id', 'first_name', 'last_name', 'email', 'avatar', 'organizations.id'],
				filter: {
					organizations: {
						organizations_id: {
							id: {
								_in: allOrgIds, // Match any of the organization IDs
							},
						},
					},
				},
			});

			filteredUsers.value = users.map((user) => ({
				...user,
				label: user.id === currentUser.value.id ? 'You' : `${user.first_name} ${user.last_name}`,
			}));

			// filteredUsers.value = users.map((user) => ({
			// 	id: user.id,
			// 	first_name: user.first_name,
			// 	last_name: user.last_name,
			// 	label: `${user.first_name} ${user.last_name}`,
			// 	email: user.email,
			// 	avatar: user.avatar,
			// 	organizations: user.organizations,
			// }));
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
