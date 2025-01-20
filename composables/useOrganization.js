export function useOrganization() {
	console.log('[useOrganization] Composable initialized');

	const selectedOrg = useState('selectedOrganization', () => null);
	const organizations = useState('organizations', () => []);
	const isLoading = useState('orgIsLoading', () => false);
	const error = useState('orgError', () => null);
	const isInitialized = useState('orgIsInitialized', () => false);

	const { user } = useDirectusAuth();
	console.log('[useOrganization] Initial user state:', user.value);

	const hasMultipleOrgs = computed(() => organizations.value.length > 1);
	const organizationOptions = computed(() => [{ id: null, name: 'All Organizations' }, ...organizations.value]);

	const currentOrg = computed(() => {
		if (!selectedOrg.value || !organizations.value.length) {
			console.log(
				'[useOrganization] No current org - selected:',
				selectedOrg.value,
				'orgs:',
				organizations.value.length,
			);
			return null;
		}
		return organizations.value.find((org) => org.id === selectedOrg.value);
	});

	const loadUserOrganizations = (userData) => {
		console.log('[useOrganization] Loading organizations for user:', userData?.id);

		if (!userData || typeof userData !== 'object') {
			console.log('[useOrganization] No valid user data, clearing organizations');
			organizations.value = [];
			return;
		}

		// Check if user.organizations is defined and is an array
		if (!Array.isArray(userData.organizations)) {
			console.warn('[useOrganization] User has no valid organizations array:', userData);
			organizations.value = [];
			return;
		}

		try {
			organizations.value = userData.organizations.reduce((validOrgs, org) => {
				if (!org || typeof org !== 'object') {
					console.warn('[useOrganization] Invalid organization entry:', org);
					return validOrgs;
				}

				const organizationData = org.organizations_id;
				if (organizationData?.id && organizationData?.name) {
					validOrgs.push({
						id: organizationData.id,
						name: organizationData.name,
						logo: organizationData.logo ?? null,
					});
				} else {
					console.warn('[useOrganization] Invalid organization data:', organizationData);
				}
				return validOrgs;
			}, []);
		} catch (err) {
			console.error('[useOrganization] Error processing organizations:', err);
			organizations.value = [];
		}
	};

	const setOrganization = (orgId) => {
		selectedOrg.value = orgId;
		if (process.client) {
			try {
				localStorage.setItem('selectedOrganization', orgId);
			} catch (err) {
				console.warn('Failed to save selected organization to localStorage:', err);
			}
		}
	};

	const clearOrganization = () => {
		console.log('[useOrganization] Clearing organization');
		selectedOrg.value = null;
		organizations.value = [];
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
				console.warn('[useOrganization] Error restoring saved organization:', err);
			}
		}

		selectedOrg.value = organizations.value.length === 1 ? organizations.value[0].id : null;
	};

	const initializeOrganizations = async () => {
		if (!user.value) {
			console.log('[useOrganization] User not available, skipping initialization');
			return;
		}

		console.log('[useOrganization] Starting initialization');
		isLoading.value = true;
		error.value = null;

		try {
			organizations.value = [];
			loadUserOrganizations(user.value);
			tryRestoreSelectedOrg();
			isInitialized.value = true;
		} catch (err) {
			console.error('[useOrganization] Initialization error:', err);
			error.value = err.message;
			clearOrganization();
		} finally {
			isLoading.value = false;
		}
	};

	// Watch for changes in `user` and run initialization when available
	watch(
		user,
		(newUser) => {
			console.log('[useOrganization] User changed:', newUser?.id);

			if (newUser) {
				initializeOrganizations();
			} else {
				console.log('[useOrganization] User is not logged in, clearing organizations');
				clearOrganization();
			}
		},
		{ immediate: true },
	);

	onMounted(() => {
		console.log('[useOrganization] Component mounted');
		// Check if user is loaded and initialize
		if (user.value) {
			initializeOrganizations();
		}
	});

	return {
		selectedOrg: readonly(selectedOrg),
		organizations: readonly(organizations),
		isLoading: readonly(isLoading),
		error: readonly(error),
		isInitialized: readonly(isInitialized),
		hasMultipleOrgs,
		organizationOptions,
		currentOrg,
		setOrganization,
		clearOrganization,
		initializeOrganizations,
	};
}
