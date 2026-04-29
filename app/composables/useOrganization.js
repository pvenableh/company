import { useStorageSync } from './useStorageSync';

export function useOrganization() {
	const orgInitializing = useState('orgInitializing', () => false);
	const selectedOrg = useState('selectedOrganization', () => null);
	const organizations = useState('organizations', () => []);
	const error = useState('orgError', () => null);
	const isInitialized = useState('orgIsInitialized', () => false);
	// Show-archived toggle: archived orgs are excluded by default. Flip via
	// the org switcher dropdown to surface them (for restore).
	const showArchived = useState('showArchivedOrgs', () => false);

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

	// Active = not archived. Archived orgs are hidden by default; the switcher
	// can opt-in via showArchived. selectedOrg can still resolve to an archived
	// org (so the owner can navigate in to restore) — currentOrg below uses the
	// raw list, not the filtered one.
	const visibleOrganizations = computed(() => {
		if (showArchived.value) return organizations.value;
		return organizations.value.filter((org) => !org.archived_at);
	});

	const archivedOrganizations = computed(() => organizations.value.filter((org) => !!org.archived_at));
	const hasArchivedOrgs = computed(() => archivedOrganizations.value.length > 0);

	const hasMultipleOrgs = computed(() => visibleOrganizations.value.length > 1);
	const organizationOptions = computed(() => [{ id: null, name: 'All Organizations' }, ...visibleOrganizations.value]);

	const currentOrg = computed(() => {
		if (!selectedOrg.value || !organizations.value.length) return null;
		return organizations.value.find((org) => org.id === selectedOrg.value);
	});

	const isCurrentOrgArchived = computed(() => !!currentOrg.value?.archived_at);

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
			console.log('[fetchOrgDetails]', { side: import.meta.server ? 'SSR' : 'CLIENT', userId: user.value.id });
			// Fetch orgs and memberships in parallel
			const [junctionOrgs, memberships] = await Promise.all([
				orgItems.list({
					filter: {
						users: { directus_users_id: { _eq: user.value.id } },
						active: { _neq: false },
					},
					fields: ['id', 'name', 'logo', 'icon', 'plan', 'folder', 'active_addons', 'default_hourly_rate', 'email', 'phone', 'address', 'archived_at'],
				}),
				membershipItems.list({
					filter: {
						user: { _eq: user.value.id },
						status: { _eq: 'active' },
					},
					fields: ['id', 'organization', 'role.id', 'role.name', 'role.slug', 'client.id', 'client.name'],
				}).catch((e) => { console.log('[fetchOrgDetails] memberships err:', e?.message); return []; }),
			]);
			console.log('[fetchOrgDetails] junctionOrgs:', junctionOrgs?.length, 'memberships:', memberships?.length);

			const membershipByOrg = {};
			for (const m of memberships) {
				const orgId = typeof m.organization === 'object' ? m.organization?.id : m.organization;
				if (orgId) membershipByOrg[orgId] = m;
			}

			// Fetch any membership-only orgs not already in junction results
			const junctionOrgIds = new Set(junctionOrgs.map((org) => org.id));
			const membershipOnlyOrgIds = Object.keys(membershipByOrg).filter((id) => !junctionOrgIds.has(id));

			let membershipOrgs = [];
			if (membershipOnlyOrgIds.length > 0) {
				try {
					membershipOrgs = await orgItems.list({
						filter: {
							id: { _in: membershipOnlyOrgIds },
							active: { _neq: false },
						},
						fields: ['id', 'name', 'logo', 'icon', 'plan', 'folder', 'active_addons', 'default_hourly_rate', 'email', 'phone', 'address', 'archived_at'],
					});
				} catch {
					// Continue if membership-only orgs can't be fetched
				}
			}

			// Merge both sources
			const data = [...junctionOrgs, ...membershipOrgs];

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
					folder: org.folder ?? null,
					active_addons: org.active_addons ?? null,
					default_hourly_rate: org.default_hourly_rate ?? null,
					email: org.email ?? null,
					phone: org.phone ?? null,
					address: org.address ?? null,
					archived_at: org.archived_at ?? null,
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
			console.error('[fetchOrgDetails] CAUGHT:', err?.message, err?.statusCode, err?.data?.message);
			error.value = err.message;
		} finally {
			orgInitializing.value = false;
		}
	};

	const tryRestoreSelectedOrg = () => {
		const savedOrg = orgStorage.getValue();
		// Auto-select prefers active orgs only; archived orgs are reachable
		// only via explicit selection from the switcher with showArchived on.
		const activeOrgs = organizations.value.filter((org) => !org.archived_at);

		if (savedOrg && organizations.value.some((org) => org.id === savedOrg)) {
			if (selectedOrg.value !== savedOrg) {
				orgStorage.setValue(savedOrg);
			}
		} else if (activeOrgs.length >= 1) {
			// Auto-select the first active org (sorted by most activity) when no saved value
			orgStorage.setValue(activeOrgs[0].id);
		} else if (organizations.value.length >= 1) {
			// Fallback: only archived orgs exist — user has churned but not been deleted yet
			orgStorage.setValue(organizations.value[0].id);
		} else {
			orgStorage.clearValue();
		}
	};

	// In-flight init promise so concurrent callers await the same fetch
	// instead of early-returning (which left the SSR `needs-org` middleware
	// reading a stale empty `organizations` and redirecting to /organization/new).
	// Stored on `useNuxtApp()` so it's per-request on SSR and per-app on client —
	// NOT in `useState` because a Promise can't be JSON-serialized into the
	// hydration payload.
	const nuxtApp = useNuxtApp();

	const initializeOrganizations = async () => {
		if (isInitialized.value || !user.value) return;
		if (nuxtApp._orgInitInflight) return nuxtApp._orgInitInflight;

		const run = (async () => {
			orgInitializing.value = true;
			error.value = null;
			try {
				organizations.value = [];
				await fetchOrganizationDetails();
				tryRestoreSelectedOrg();
				isInitialized.value = true;
			} catch (err) {
				console.error('Initialization error:', err);
				error.value = err.message;
				clearOrganization();
			} finally {
				orgInitializing.value = false;
				nuxtApp._orgInitInflight = null;
			}
		})();
		nuxtApp._orgInitInflight = run;
		return run;
	};

	const setOrganization = (orgId) => {
		if (orgId !== selectedOrg.value) {
			orgStorage.setValue(orgId);
		}
	};

	const clearOrganization = () => {
		organizations.value = [];
		selectedOrg.value = null;
		isInitialized.value = false;
		orgInitializing.value = false;
		error.value = null;
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

	// Reset SSR-stale loading state on client hydration and retry init
	if (import.meta.client) {
		onNuxtReady(() => {
			if (orgInitializing.value && !isInitialized.value) {
				orgInitializing.value = false;
				if (user.value) {
					initializeOrganizations();
				}
			}
		});
	}

	// Track the user *id* so a swap between two distinct authenticated users
	// (cross-tab sync, register-then-signin in the same browser) trips a
	// state reset. Without this, `initializeOrganizations` short-circuits on
	// the prior user's `isInitialized=true` and the new user inherits stale
	// orgs/selectedOrg until a hard reload — a tenant-isolation footgun.
	watch(
		() => user.value?.id || null,
		(newId, oldId) => {
			if (newId !== oldId) clearOrganization();
			if (newId) initializeOrganizations();
		},
		{ immediate: true },
	);

	return {
		selectedOrg: readonly(selectedOrg),
		organizations: readonly(organizations),
		visibleOrganizations,
		archivedOrganizations,
		hasArchivedOrgs,
		showArchived,
		isLoading: readonly(orgInitializing),
		error: readonly(error),
		isInitialized: readonly(isInitialized),
		hasMultipleOrgs,
		organizationOptions,
		currentOrg,
		isCurrentOrgArchived,
		setOrganization,
		clearOrganization,
		initializeOrganizations,
		fetchOrganizationDetails,
		getOrganizationFilter,
		setupListeners,
	};
}
