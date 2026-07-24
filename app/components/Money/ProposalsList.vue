<!--
  MoneyProposalsList — shared proposals list body for every Documents
  surface (Money floor, ClientWorkspace tab, /leads/[id] tab).

  Scope props pick how to filter the query — exactly one is required
  in practice:
    - `clientId`: walk lead.resulting_client OR contact.client (proposals
       have no direct client FK, so both paths are unioned)
    - `leadId`:   proposals.lead._eq
    - `projectId`: proposals.project._eq (FK added by
       scripts/setup-doc-project-fk.ts — tab shows empty until the
       migration runs and rows are linked)

  Without any scope prop, lists the full org-scoped set (used by the
  Money/Documents floor).

  Row click pushes the proposal slide-over panel; never navigates to
  /proposals/[id]. Header "Full Page" chip on the panel is the deep-
  link there.
-->
<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';
import type { ProposalStatus } from '~~/shared/proposals-enhanced';
import { useDebounceFn } from '@vueuse/core';

const props = defineProps<{
	clientId?: string | null;
	leadId?: string | number | null;
	projectId?: string | null;
	/** With `clientId`, restrict to client-LEVEL docs not tied to any project
	    (project _null) — used for the "From [client]" section on a project. */
	clientLevelOnly?: boolean;
	/** Show built-in search + status filter bar. Off by default for the
	    in-tab surfaces; on for the standalone Money floor. */
	showFilters?: boolean;
	/** Optional header row label override; hides the count chip when
	    rendered inside a tab body that has its own count. */
	hideHeader?: boolean;
}>();

const emit = defineEmits<{
	(e: 'count', value: number): void;
	(e: 'new-clicked'): void;
}>();

const proposalSlide = useAppSlideOver('proposal');
const { selectedOrg } = useOrganization();
const proposalItems = useDirectusItems('proposals');

const items = ref<any[]>([]);
const loading = ref(true);
const search = ref('');
const statusFilter = ref<'' | ProposalStatus>('');

const statusOptions = [
	{ value: '', label: 'All Statuses' },
	...Object.entries(PROPOSAL_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

function buildScopeFilter(): Record<string, any> | null {
	if (props.clientId) {
		// Proposals have no direct client FK. Union the two paths that
		// can tie a proposal to a client: the originating lead converted
		// into this client, OR the linked contact belongs to this client.
		const clientOr = {
			_or: [
				// Direct link (set when attached to a client), then the indirect
				// walks: originating lead → resulting client, or linked contact.
				{ client: { _eq: props.clientId } },
				{ lead: { resulting_client: { _eq: props.clientId } } },
				{ contact: { client: { _eq: props.clientId } } },
			],
		};
		// Client-LEVEL view (project inheritance): only docs not tied to a project.
		return props.clientLevelOnly
			? { _and: [clientOr, { project: { _null: true } }] }
			: clientOr;
	}
	if (props.leadId != null) {
		return { lead: { _eq: Number(props.leadId) } };
	}
	if (props.projectId) {
		return { project: { _eq: props.projectId } };
	}
	return null;
}

async function fetchData() {
	if (!selectedOrg.value) {
		items.value = [];
		loading.value = false;
		emit('count', 0);
		return;
	}
	loading.value = true;
	try {
		const filter: Record<string, any> = {
			_and: [{ organization: { _eq: selectedOrg.value } }],
		};
		if (statusFilter.value) filter._and.push({ proposal_status: { _eq: statusFilter.value } });
		const scope = buildScopeFilter();
		if (scope) filter._and.push(scope);

		items.value = await proposalItems.list({
			fields: [
				'id', 'title', 'proposal_status', 'total_value', 'valid_until',
				'date_created', 'date_sent',
				'organization.id', 'organization.name',
				'contact.id', 'contact.first_name', 'contact.last_name',
				'lead.id', 'lead.status',
			],
			filter,
			sort: ['-date_created'],
			search: search.value || undefined,
			limit: 100,
		}) as any[];
		emit('count', items.value.length);
	} catch (err) {
		console.error('[MoneyProposalsList] fetch failed', err);
		items.value = [];
		emit('count', 0);
	} finally {
		loading.value = false;
	}
}

const debouncedFetch = useDebounceFn(fetchData, 300);
watch(search, () => debouncedFetch());
watch(statusFilter, () => fetchData());
watch(() => [props.clientId, props.leadId, props.projectId, selectedOrg.value], () => fetchData());

onMounted(fetchData);

defineExpose({ refresh: fetchData });

// Status color routes through the canonical palette-driven buckets.
const { getStatusBadgeClasses } = useStatusStyle();
function statusLabel(s: string | null | undefined): string {
	return PROPOSAL_STATUS_LABELS[s as ProposalStatus] || (s ?? '—');
}
function rowSubtitle(p: any): string {
	if (p.contact?.first_name || p.contact?.last_name) {
		return [p.contact.first_name, p.contact.last_name].filter(Boolean).join(' ');
	}
	if (p.organization?.name) return p.organization.name;
	return '';
}
function fmtValue(v: number | string | null | undefined): string {
	const n = Number(v);
	if (!Number.isFinite(n) || n === 0) return '';
	return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtExpiry(d: string | null | undefined): string {
	if (!d) return '';
	try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
	catch { return ''; }
}
function openPanel(id: string, ev?: MouseEvent) {
	const flipFrom = flipPayloadFrom(ev?.currentTarget as HTMLElement | null | undefined);
	proposalSlide.open(String(id), { flipFrom });
}
</script>

<template>
	<div class="space-y-3">
		<!-- Optional filter bar -->
		<div v-if="showFilters" class="flex flex-wrap items-center gap-2">
			<EInput
				v-model="search"
				icon="i-heroicons-magnifying-glass"
				placeholder="Search proposals..."
				size="sm"
				class="w-48"
			/>
			<ESelectMenu
				v-model="statusFilter"
				:options="statusOptions"
				value-attribute="value"
				option-attribute="label"
				placeholder="Status"
				size="sm"
				class="w-36"
			/>
		</div>

		<!-- Loading -->
		<div v-if="loading && !items.length" class="flex items-center justify-center py-12">
			<Icon name="lucide:loader-2" class="w-5 h-5 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty -->
		<div v-else-if="!items.length" class="flex flex-col items-center justify-center py-10 gap-2">
			<Icon name="lucide:file-text" class="w-8 h-8 text-muted-foreground/40" />
			<p class="text-xs text-muted-foreground">
				{{ search || statusFilter ? 'No proposals match your filters.' : 'No proposals yet.' }}
			</p>
			<NuxtLink v-if="!search && !statusFilter" to="/proposals/draft" class="mt-1">
				<button class="rounded-full px-3 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press inline-flex items-center gap-1.5 shadow-sm transition-colors">
					<Icon name="lucide:sparkles" class="w-3 h-3" />
					Draft with Earnest
					<AiSpendMark muted />
				</button>
			</NuxtLink>
		</div>

		<!-- List -->
		<div v-else class="space-y-px">
			<button
				v-for="p in items"
				:key="p.id"
				type="button"
				class="flex w-full items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group text-left"
				@click="openPanel(p.id, $event)"
			>
				<Icon name="lucide:file-text" class="w-4 h-4 text-muted-foreground shrink-0" />
				<div class="flex-1 min-w-0 flex items-center gap-2">
					<p class="text-sm font-medium truncate">{{ p.title || 'Untitled proposal' }}</p>
					<span v-if="rowSubtitle(p)" class="hidden sm:inline text-[11px] text-muted-foreground truncate">
						· {{ rowSubtitle(p) }}
					</span>
				</div>
				<span v-if="fmtValue(p.total_value)" class="hidden md:inline text-xs font-medium tabular-nums shrink-0">
					{{ fmtValue(p.total_value) }}
				</span>
				<span v-if="fmtExpiry(p.valid_until)" class="hidden lg:inline text-[11px] text-muted-foreground shrink-0">
					exp {{ fmtExpiry(p.valid_until) }}
				</span>
				<span
					v-if="p.proposal_status"
					class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0"
					:class="getStatusBadgeClasses(p.proposal_status)"
				>{{ statusLabel(p.proposal_status) }}</span>
				<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
			</button>
		</div>
	</div>
</template>
