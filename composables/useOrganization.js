export function useOrganization() {
	const orgInitializing = useState('orgInitializing', () => false);
	const selectedOrg = useState('selectedOrganization', () => null);
	const organizations = useState('organizations', () => []);
	const error = useState('orgError', () => null);
	const isInitialized = useState('orgIsInitialized', () => false);

	const { user } = useDirectusAuth();

	const hasMultipleOrgs = computed(() => organizations.value.length > 1);
	const organizationOptions = computed(() => [{ id: null, name: 'All Organizations' }, ...organizations.value]);

	const currentOrg = computed(() => {
		if (!selectedOrg.value || !organizations.value.length) return null;
		return organizations.value.find((org) => org.id === selectedOrg.value);
	});

	const getOrganizationFilter = () => {
		if (!selectedOrg.value) return {};
		return { organization: { _eq: selectedOrg.value } };
	};

	const loadUserOrganizations = (userData) => {
		if (!userData || typeof userData !== 'object') {
			organizations.value = [];
			return;
		}

		if (!Array.isArray(userData.organizations)) {
			organizations.value = [];
			return;
		}

		try {
			// First, gather all valid organizations with their activity counts
			const orgsWithActivity = userData.organizations.reduce((validOrgs, org) => {
				if (!org || typeof org !== 'object') return validOrgs;

				const organizationData = org.organizations_id;
				if (organizationData?.id && organizationData?.name) {
					// Count tickets and projects, ensuring they're valid arrays
					const ticketsCount = Array.isArray(organizationData.tickets) ? organizationData.tickets.length : 0;
					const projectsCount = Array.isArray(organizationData.projects) ? organizationData.projects.length : 0;
					const totalActivity = ticketsCount + projectsCount;

					validOrgs.push({
						id: organizationData.id,
						name: organizationData.name,
						logo: organizationData.logo ?? null,
						ticketsCount,
						projectsCount,
						totalActivity,
					});
				}
				return validOrgs;
			}, []);

			// Sort organizations by total activity (tickets + projects) in descending order
			const sortedOrgs = orgsWithActivity.sort((a, b) => {
				// Primary sort by total activity
				if (b.totalActivity !== a.totalActivity) {
					return b.totalActivity - a.totalActivity;
				}
				// Secondary sort by name if total activity is equal
				return a.name.localeCompare(b.name);
			});

			// Update the organizations state with the sorted results
			organizations.value = sortedOrgs;
		} catch (err) {
			console.error('Error processing organizations:', err);
			organizations.value = [];
		}
	};

	const setOrganization = (orgId) => {
		selectedOrg.value = orgId;
		if (process.client) {
			try {
				localStorage.setItem('selectedOrganization', JSON.stringify(orgId));
			} catch (err) {
				console.warn('Failed to save selected organization to localStorage:', err);
			}
		}
	};

	const clearOrganization = () => {
		selectedOrg.value = null;
		organizations.value = [];
		isInitialized.value = false;
		if (process.client) {
			try {
				localStorage.removeItem('selectedOrganization');
			} catch (err) {
				console.warn('Failed to remove organization from localStorage:', err);
			}
		}
	};

	const tryRestoreSelectedOrg = () => {
		if (!organizations.value.length) {
			selectedOrg.value = null;
			return;
		}

		if (process.client && organizations.value.length > 1) {
			try {
				const savedOrg = localStorage.getItem('selectedOrganization');
				if (savedOrg) {
					const parsedOrg = JSON.parse(savedOrg);
					if (organizations.value.some((org) => org.id === parsedOrg)) {
						selectedOrg.value = parsedOrg;
						return;
					}
				}
			} catch (err) {
				console.warn('Error restoring saved organization:', err);
			}
		}

		selectedOrg.value = organizations.value.length === 1 ? organizations.value[0].id : null;
	};

	const initializeOrganizations = async () => {
		if (orgInitializing.value || isInitialized.value) return;
		if (!user.value) {
			clearOrganization();
			return;
		}

		orgInitializing.value = true;
		error.value = null;

		try {
			organizations.value = [];
			await nextTick();

			loadUserOrganizations(user.value);
			tryRestoreSelectedOrg();
			isInitialized.value = true;
		} catch (err) {
			error.value = err.message;
			clearOrganization();
		} finally {
			orgInitializing.value = false;
		}
	};

	watch(
		() => user.value,
		(newUser) => {
			if (newUser) {
				initializeOrganizations();
			} else {
				clearOrganization();
			}
		},
		{ immediate: true },
	);

	if (user.value && !isInitialized.value) {
		initializeOrganizations();
	}

	return {
		selectedOrg: readonly(selectedOrg),
		organizations: readonly(organizations),
		isLoading: readonly(orgInitializing),
		error: readonly(error),
		isInitialized: readonly(isInitialized),
		hasMultipleOrgs,
		organizationOptions,
		currentOrg,
		setOrganization,
		clearOrganization,
		initializeOrganizations,
		getOrganizationFilter,
	};
}
