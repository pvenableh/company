import { useStorageSync } from './useStorageSync';

export function useOrganization() {
	const orgInitializing = useState('orgInitializing', () => false);
	const selectedOrg = useState('selectedOrganization', () => null);
	const organizations = useState('organizations', () => []);
	const error = useState('orgError', () => null);
	const isInitialized = useState('orgIsInitialized', () => false);

	const orgStorage = useStorageSync('selectedOrganization', {
		cookie: {
			maxAge: 60 * 60 * 24 * 30,
			path: '/',
			sameSite: 'lax',
		},
		priorities: ['cookie', 'localStorage'],
	});

	const orgItems = useDirectusItems('organizations');

	const { user } = useDirectusAuth();

	const hasMultipleOrgs = computed(() => organizations.value.length > 1);
	const organizationOptions = computed(() => [{ id: null, name: 'All Organizations' }, ...organizations.value]);

	const currentOrg = computed(() => {
		if (!selectedOrg.value || !organizations.value.length) return null;
		return organizations.value.find((org) => org.id === selectedOrg.value);
	});

	const getOrganizationFilter = (orgId) => {
		const idToFilterBy = orgId !== undefined ? orgId : selectedOrg.value;
		return idToFilterBy ? { organization: { _eq: idToFilterBy } } : {};
	};

	const fetchOrganizationDetails = async () => {
		if (!user.value?.id) {
			organizations.value = [];
			return;
		}

		orgInitializing.value = true;
		error.value = null;

		try {
			const data = await orgItems.list({
				filter: { users: { directus_users_id: { _eq: user.value.id } } },
				fields: ['id', 'name', 'logo', 'icon', 'tickets.id', 'projects.id'],
			});

			const processed = data.map((org) => ({
				id: org.id,
				name: org.name,
				logo: org.logo ?? null,
				icon: org.icon ?? null,
				ticketsCount: org.tickets?.length || 0,
				projectsCount: org.projects?.length || 0,
				totalActivity: (org.tickets?.length || 0) + (org.projects?.length || 0),
			}));

			organizations.value = processed.sort((a, b) => {
				if (b.totalActivity !== a.totalActivity) {
					return b.totalActivity - a.totalActivity;
				}
				return a.name.localeCompare(b.name);
			});
		} catch (err) {
			console.error('Failed to fetch organizations:', err);
			error.value = err.message;
		} finally {
			orgInitializing.value = false;
		}
	};

	const tryRestoreSelectedOrg = () => {
		const savedOrg = orgStorage.getValue();

		if (savedOrg && organizations.value.some((org) => org.id === savedOrg)) {
			if (selectedOrg.value !== savedOrg) {
				orgStorage.setValue(savedOrg);
			}
		} else if (organizations.value.length === 1) {
			orgStorage.setValue(organizations.value[0].id);
		} else {
			orgStorage.clearValue();
		}
	};

	const initializeOrganizations = async () => {
		if (orgInitializing.value || isInitialized.value || !user.value) return;

		orgInitializing.value = true;
		error.value = null;

		try {
			organizations.value = [];
			await fetchOrganizationDetails();
			tryRestoreSelectedOrg();
			isInitialized.value = true;
			// console.log('Organization initialized:', selectedOrg.value);
		} catch (err) {
			console.error('Initialization error:', err);
			error.value = err.message;
			clearOrganization();
		} finally {
			orgInitializing.value = false;
		}
	};

	const setOrganization = (orgId) => {
		if (orgId !== selectedOrg.value) {
			orgStorage.setValue(orgId);
		}
	};

	const clearOrganization = () => {
		organizations.value = [];
		isInitialized.value = false;
		orgStorage.clearValue();
	};

	const setupListeners = () => {
		if (!import.meta.client) return;

		const onStorageChange = (event) => {
			if (event.key === 'selectedOrganization') {
				const newValue = event.newValue;
				if (newValue !== selectedOrg.value) {
					// console.log('Org changed in another tab:', newValue);

					if (!newValue) {
						selectedOrg.value = null;
					} else if (organizations.value.some((org) => org.id === newValue)) {
						selectedOrg.value = newValue;
					} else {
						console.warn('Cross-tab org is not available in this session.');
					}
				}
			}
		};

		window.addEventListener('storage', onStorageChange);
		return () => window.removeEventListener('storage', onStorageChange);
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
		fetchOrganizationDetails,
		getOrganizationFilter,
		setupListeners,
	};
}
