// composables/useOrganization.js
import { useStorageSync } from './useStorageSync';

export function useOrganization() {
	// Local state
	const orgInitializing = useState('orgInitializing', () => false);
	const selectedOrg = useState('selectedOrganization', () => null);
	const organizations = useState('organizations', () => []);
	const error = useState('orgError', () => null);
	const isInitialized = useState('orgIsInitialized', () => false);

	// Setup storage for organization with cookies and localStorage
	const orgStorage = useStorageSync('selectedOrganization', {
		// Instantiate orgStorage
		cookie: {
			maxAge: 60 * 60 * 24 * 30, // 30 days
			path: '/',
			sameSite: 'lax',
		},
		priorities: ['cookie', 'localStorage'], // Cookie has priority for SSR support
	});

	const { user } = useDirectusAuth();
	let storageListener = null;

	const hasMultipleOrgs = computed(() => organizations.value.length > 1);
	const organizationOptions = computed(() => [{ id: null, name: 'All Organizations' }, ...organizations.value]);

	const currentOrg = computed(() => {
		if (!selectedOrg.value || !organizations.value.length) return null;
		return organizations.value.find((org) => org.id === selectedOrg.value);
	});

	// Get organization filter for queries
	const getOrganizationFilter = () => {
		if (!selectedOrg.value) return {};
		return { organization: { _eq: selectedOrg.value } };
	};

	// Process user organizations data from API
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
						icon: organizationData.icon ?? null,
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

	// Set organization
	const setOrganization = (orgId) => {
		// Only change if different from current value
		if (orgId === selectedOrg.value) return;

		// Save to all storage mechanisms
		orgStorage.setValue(orgId);
	};

	// Clear organization
	const clearOrganization = () => {
		organizations.value = [];
		isInitialized.value = false;
		orgStorage.clearValue();
	};

	// Try to restore selected organization
	const tryRestoreSelectedOrg = () => {
		if (!organizations.value.length) {
			orgStorage.clearValue();
			return;
		}

		// Try to get saved organization from storage
		const savedOrg = orgStorage.getValue();

		// Validate the organization exists in current organizations
		if (savedOrg && organizations.value.some((org) => org.id === savedOrg)) {
			// Organization is valid, use it
			if (selectedOrg.value !== savedOrg) {
				orgStorage.setValue(savedOrg);
			}
			return;
		}

		// Default to first organization if only one exists, otherwise null (All Organizations)
		if (organizations.value.length === 1) {
			orgStorage.setValue(organizations.value[0].id);
		} else {
			orgStorage.clearValue();
		}
	};

	// Initialize organizations from user data
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

			// Log for debugging
			console.log('Organization set:', selectedOrg.value);
		} catch (err) {
			console.error('Error initializing organizations:', err);
			error.value = err.message;
			clearOrganization();
		} finally {
			orgInitializing.value = false;
		}
	};

	const setupListeners = () => {
		if (!import.meta.client) return;

		// These event listeners will be set up by the component
		const onStorageChange = (event) => {
			if (event.key === 'selectedOrganization') {
				const newValue = event.newValue;
				if (newValue !== selectedOrg.value) {
					console.log('Organization changed in another tab:', newValue);

					// Only update if the org exists in available orgs
					if (newValue === null) {
						selectedOrg.value = null;
					} else if (organizations.value.some((org) => org.id === newValue)) {
						selectedOrg.value = newValue;
					} else {
						console.warn('Organization from other tab is not available in current user context');
					}
				}
			}
		};

		// Add event listener
		window.addEventListener('storage', onStorageChange);
		storageListener = onStorageChange;

		// Return cleanup function
		return () => {
			if (storageListener) {
				window.removeEventListener('storage', storageListener);
				storageListener = null;
			}
		};
	};

	// Watch for user changes to load their organizations
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
		getOrganizationFilter,
		// CHANGE: Return the setupListeners method for components to use
		setupListeners,
	};
}
