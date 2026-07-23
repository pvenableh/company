/**
 * usePinnedWork — the user's explicitly pinned projects and clients for the
 * current org, unified into one "recommended work" list for the home surface.
 *
 * Pinning already exists as a boolean `pinned` column on both `projects` and
 * `clients` (see scripts/setup-pinned-fields.ts) and is toggled from the
 * carousels / workspaces via `usePinnable`. This composable is the read side:
 * it surfaces whatever the user has chosen to keep close as the top of home.
 */

export type PinnedWorkType = 'project' | 'client';

export interface PinnedWorkItem {
	key: string;
	type: PinnedWorkType;
	id: string;
	title: string;
	subtitle: string | null;
	status: string | null;
	accent: string | null;
	logo: string | null;
	raw: any;
}

export function usePinnedWork() {
	const { selectedOrg } = useOrganization();
	const projectItems = useDirectusItems('projects');
	const clientItems = useDirectusItems('clients');
	const { togglePin: togglePinProject } = usePinnable('projects');
	const { togglePin: togglePinClient } = usePinnable('clients');

	const projects = ref<any[]>([]);
	const clients = ref<any[]>([]);
	const loading = ref(true);

	async function load() {
		if (!selectedOrg.value) {
			projects.value = [];
			clients.value = [];
			loading.value = false;
			return;
		}
		loading.value = true;
		try {
			const [proj, cli] = await Promise.all([
				projectItems.list({
					fields: ['id', 'title', 'status', 'pinned', 'due_date', 'service.color', 'client.name'],
					filter: { _and: [{ organization: { _eq: selectedOrg.value } }, { pinned: { _eq: true } }] },
					sort: ['-date_updated'],
					limit: 24,
				}).catch(() => []),
				clientItems.list({
					fields: ['id', 'name', 'logo', 'status', 'pinned'],
					filter: { _and: [{ organization: { _eq: selectedOrg.value } }, { pinned: { _eq: true } }, { status: { _neq: 'archived' } }] },
					sort: ['-last_activity_at', 'name'],
					limit: 24,
				}).catch(() => []),
			]);
			projects.value = (proj || []) as any[];
			clients.value = (cli || []) as any[];
		} catch (err) {
			console.error('[usePinnedWork] load failed:', err);
			projects.value = [];
			clients.value = [];
		} finally {
			loading.value = false;
		}
	}

	watch(selectedOrg, load, { immediate: true });

	// Clients lead (the relationship), then projects (the work). Within each,
	// input order is preserved (already sorted by recency server-side).
	const items = computed<PinnedWorkItem[]>(() => [
		...clients.value.map((c): PinnedWorkItem => ({
			key: `client-${c.id}`,
			type: 'client',
			id: String(c.id),
			title: c.name || 'Untitled client',
			subtitle: 'Client',
			status: c.status || null,
			accent: null,
			logo: c.logo || null,
			raw: c,
		})),
		...projects.value.map((p): PinnedWorkItem => ({
			key: `project-${p.id}`,
			type: 'project',
			id: String(p.id),
			title: p.title || 'Untitled project',
			subtitle: p.client?.name || 'Project',
			status: p.status || null,
			accent: p.service?.color || null,
			logo: null,
			raw: p,
		})),
	]);

	const hasPinned = computed(() => items.value.length > 0);

	/** Unpin an item and drop it from the local list optimistically. */
	async function unpin(item: PinnedWorkItem) {
		if (item.type === 'project') {
			await togglePinProject(item.raw);
			projects.value = projects.value.filter((p) => String(p.id) !== item.id);
		} else {
			await togglePinClient(item.raw);
			clients.value = clients.value.filter((c) => String(c.id) !== item.id);
		}
	}

	return { items, hasPinned, loading, refresh: load, unpin };
}
