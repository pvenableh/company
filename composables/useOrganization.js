export function useOrganization() {
	const selectedOrg = useState('selectedOrganization', () => null);
	const organizations = useState('organizations', () => []);
	const isLoading = useState('orgIsLoading', () => false);
	const error = useState('orgError', () => null);

	const { user, readMe } = useDirectusAuth();

	const hasMultipleOrgs = computed(() => organizations.value.length > 1);

	const organizationOptions = computed(() => [{ id: null, name: 'All Organizations' }, ...organizations.value]);

	const currentOrg = computed(() => {
		if (!selectedOrg.value) return null;
		return organizations.value.find((org) => org.id === selectedOrg.value);
	});

	const initializeOrganizations = async () => {
		if (!user.value) {
			try {
				// Attempt to fetch user if not available
				const fetchedUser = await readMe();
				if (!fetchedUser) throw new Error('Failed to fetch user');
			} catch (err) {
				console.error('Error fetching user for organizations:', err);
				error.value = err.message;
				return;
			}
		}

		try {
			isLoading.value = true;
			error.value = null;

			// Fetch user's organizations
			const userOrgs = user.value?.organizations || [];
			organizations.value = userOrgs.map((org) => ({
				id: org.organizations_id.id,
				name: org.organizations_id.name,
				logo: org.organizations_id.logo,
			}));

			// If only one organization, auto-select it
			if (organizations.value.length === 1) {
				selectedOrg.value = organizations.value[0].id;
			} else if (process.client) {
				// Restore from local storage
				try {
					const savedOrg = localStorage.getItem('selectedOrganization');
					if (savedOrg) {
						const parsedOrg = JSON.parse(savedOrg);
						if (organizations.value.some((org) => org.id === parsedOrg)) {
							selectedOrg.value = parsedOrg;
						}
					}
				} catch (err) {
					console.warn('Failed to parse saved organization:', err);
				}
			}
		} catch (err) {
			console.error('Error initializing organizations:', err);
			error.value = err.message;
		} finally {
			isLoading.value = false;
		}
	};

	const setOrganization = (orgId) => {
		console.log('Updating selected organization to:', orgId);
		if (orgId === null || organizations.value.some((org) => org.id === orgId)) {
			selectedOrg.value = orgId;
			if (process.client) {
				localStorage.setItem('selectedOrganization', JSON.stringify(orgId));
			}
		}
	};

	const clearOrganization = () => {
		selectedOrg.value = null;
		if (process.client) {
			localStorage.removeItem('selectedOrganization');
		}
	};

	const getOrganizationFilter = () => {
		if (!selectedOrg.value) return {};
		return { organization: { _eq: selectedOrg.value } };
	};

	// Initialize organizations on mount
	onMounted(async () => {
		if (user.value) {
			await initializeOrganizations();
		}
	});

	// Watch user state
	watch(
		() => user.value,
		async (newUser) => {
			if (newUser) {
				await initializeOrganizations();
			} else {
				clearOrganization();
			}
		},
	);

	return {
		selectedOrg: readonly(selectedOrg),
		organizations: readonly(organizations),
		isLoading: readonly(isLoading),
		error: readonly(error),
		hasMultipleOrgs,
		organizationOptions,
		currentOrg,
		setOrganization,
		clearOrganization,
		getOrganizationFilter,
		initializeOrganizations,
	};
}
