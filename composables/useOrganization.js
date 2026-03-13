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
	const membershipItems = useDirectusItems('org_memberships');

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

	const ticketItems = useDirectusItems('tickets');
	const projectItems = useDirectusItems('projects');

	const fetchOrganizationDetails = async () => {
		if (!user.value?.id) {
			organizations.value = [];
			return;
		}

		orgInitializing.value = true;
		error.value = null;

		try {
			// Fetch org list without nested ticket/project arrays (performance fix)
			const data = await orgItems.list({
				filter: {
					users: { directus_users_id: { _eq: user.value.id } },
					active: { _neq: false },
				},
				fields: ['id', 'name', 'logo', 'icon', 'plan'],
			});

			// Fetch memberships for the current user across all their orgs
			let memberships = [];
			try {
				memberships = await membershipItems.list({
					filter: {
						user: { _eq: user.value.id },
						status: { _eq: 'active' },
					},
					fields: ['id', 'organization', 'role.id', 'role.name', 'role.slug', 'client.id', 'client.name'],
				});
			} catch {
				// Memberships may not exist yet (pre-migration) — continue gracefully
			}

			const membershipByOrg = {};
			for (const m of memberships) {
				const orgId = typeof m.organization === 'object' ? m.organization?.id : m.organization;
				if (orgId) membershipByOrg[orgId] = m;
			}

			// Fetch counts per org using aggregate queries (avoids transferring full arrays)
			const orgIds = data.map((org) => org.id);
			const [ticketCounts, projectCounts] = await Promise.all([
				ticketItems.aggregate({
					aggregate: { count: ['id'] },
					groupBy: ['organization'],
					filter: { organization: { _in: orgIds } },
				}).catch(() => []),
				projectItems.aggregate({
					aggregate: { count: ['id'] },
					groupBy: ['organization'],
					filter: { organization: { _in: orgIds } },
				}).catch(() => []),
			]);

			// Build count lookup maps
			const ticketCountMap = {};
			const projectCountMap = {};
			for (const row of ticketCounts || []) {
				ticketCountMap[row.organization] = parseInt(row.count?.id || row.count || 0);
			}
			for (const row of projectCounts || []) {
				projectCountMap[row.organization] = parseInt(row.count?.id || row.count || 0);
			}

			const processed = data.map((org) => {
				const tc = ticketCountMap[org.id] || 0;
				const pc = projectCountMap[org.id] || 0;
				return {
					id: org.id,
					name: org.name,
					logo: org.logo ?? null,
					icon: org.icon ?? null,
					plan: org.plan ?? null,
					ticketsCount: tc,
					projectsCount: pc,
					totalActivity: tc + pc,
					membership: membershipByOrg[org.id] ?? null,
				};
			});

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
