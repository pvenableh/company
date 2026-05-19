<!--
  MoneyContractsList — shared contracts list body for every Documents
  surface (Money floor, ClientWorkspace tab, /leads/[id] tab).

  Scope props pick how to filter the query — exactly one is required
  in practice:
    - `clientId`:  contracts.client._eq (direct FK)
    - `leadId`:    walks proposal.lead AND contract.lead — contracts
                   linked to the lead directly OR via the proposal chain
    - `projectId`: not modeled on contracts today — emits empty

  Without any scope prop, lists the full org-scoped set (used by the
  Money/Documents floor).

  Row click pushes the contract slide-over panel; never navigates to
  /contracts/[id].
-->
<script setup lang="ts">
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from '~~/shared/contracts';
import type { ContractStatus } from '~~/shared/contracts';
import { useDebounceFn } from '@vueuse/core';

const props = defineProps<{
	clientId?: string | null;
	leadId?: string | number | null;
	projectId?: string | null;
	showFilters?: boolean;
	hideHeader?: boolean;
}>();

const emit = defineEmits<{
	(e: 'count', value: number): void;
	(e: 'new-clicked'): void;
}>();

const contractSlide = useAppSlideOver('contract');
const { selectedOrg } = useOrganization();
const contractItems = useDirectusItems('contracts');

const items = ref<any[]>([]);
const loading = ref(true);
const search = ref('');
const statusFilter = ref<'' | ContractStatus>('');

const statusOptions = [
	{ value: '', label: 'All Statuses' },
	...Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

function buildScopeFilter(): Record<string, any> | null {
	if (props.clientId) {
		// Direct client FK is the canonical path, but legacy/seeded
		// contracts often only carry the lead pointer — fall back to
		// the lead.resulting_client (or source proposal's lead) so the
		// tab matches what a user would intuitively expect.
		return {
			_or: [
				{ client: { _eq: props.clientId } },
				{ lead: { resulting_client: { _eq: props.clientId } } },
				{ proposal: { lead: { resulting_client: { _eq: props.clientId } } } },
			],
		};
	}
	if (props.leadId != null) {
		const lid = Number(props.leadId);
		// Either the contract links to the lead directly OR its source
		// proposal does. Covers contracts built from a proposal that lost
		// its lead pointer along the way.
		return {
			_or: [
				{ lead: { _eq: lid } },
				{ proposal: { lead: { _eq: lid } } },
			],
		};
	}
	if (props.projectId) {
		return { id: { _eq: '__no_match__' } };
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
		if (statusFilter.value) filter._and.push({ contract_status: { _eq: statusFilter.value } });
		const scope = buildScopeFilter();
		if (scope) filter._and.push(scope);

		items.value = await contractItems.list({
			fields: [
				'id', 'title', 'contract_status', 'total_value', 'valid_until',
				'effective_date', 'date_created', 'date_sent', 'signed_at',
				'organization.id', 'organization.name',
				'contact.id', 'contact.first_name', 'contact.last_name',
				'lead.id',
				'proposal.id', 'proposal.title',
				'client.id', 'client.name',
			],
			filter,
			sort: ['-date_created'],
			search: search.value || undefined,
			limit: 100,
		}) as any[];
		emit('count', items.value.length);
	} catch (err) {
		console.error('[MoneyContractsList] fetch failed', err);
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

function statusColor(s: string | null | undefined): string {
	return CONTRACT_STATUS_COLORS[s as ContractStatus] || '#6B7280';
}
function statusLabel(s: string | null | undefined): string {
	return CONTRACT_STATUS_LABELS[s as ContractStatus] || (s ?? '—');
}
function rowSubtitle(c: any): string {
	if (c.client?.name) return c.client.name;
	if (c.contact?.first_name || c.contact?.last_name) {
		return [c.contact.first_name, c.contact.last_name].filter(Boolean).join(' ');
	}
	if (c.organization?.name) return c.organization.name;
	return '';
}
function fmtValue(v: number | string | null | undefined): string {
	const n = Number(v);
	if (!Number.isFinite(n) || n === 0) return '';
	return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtDate(d: string | null | undefined): string {
	if (!d) return '';
	try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
	catch { return ''; }
}
function openPanel(id: string | number) {
	contractSlide.open(String(id));
}
</script>

<template>
	<div class="space-y-3">
		<div v-if="showFilters" class="flex flex-wrap items-center gap-2">
			<UInput
				v-model="search"
				icon="i-heroicons-magnifying-glass"
				placeholder="Search contracts..."
				size="sm"
				class="w-48"
			/>
			<USelectMenu
				v-model="statusFilter"
				:options="statusOptions"
				value-attribute="value"
				option-attribute="label"
				placeholder="Status"
				size="sm"
				class="w-36"
			/>
		</div>

		<div v-if="loading && !items.length" class="flex items-center justify-center py-12">
			<Icon name="lucide:loader-2" class="w-5 h-5 text-muted-foreground animate-spin" />
		</div>

		<div v-else-if="!items.length" class="flex flex-col items-center justify-center py-10 gap-2">
			<Icon name="lucide:file-signature" class="w-8 h-8 text-muted-foreground/40" />
			<p class="text-xs text-muted-foreground">
				{{ search || statusFilter ? 'No contracts match your filters.' : 'No contracts yet.' }}
			</p>
		</div>

		<div v-else class="space-y-px">
			<button
				v-for="c in items"
				:key="c.id"
				type="button"
				class="flex w-full items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group text-left"
				@click="openPanel(c.id)"
			>
				<Icon name="lucide:file-signature" class="w-4 h-4 text-muted-foreground shrink-0" />
				<div class="flex-1 min-w-0 flex items-center gap-2">
					<p class="text-sm font-medium truncate">{{ c.title || 'Untitled contract' }}</p>
					<span v-if="rowSubtitle(c)" class="hidden sm:inline text-[11px] text-muted-foreground truncate">
						· {{ rowSubtitle(c) }}
					</span>
				</div>
				<span v-if="fmtValue(c.total_value)" class="hidden md:inline text-xs font-medium tabular-nums shrink-0">
					{{ fmtValue(c.total_value) }}
				</span>
				<span v-if="c.signed_at" class="hidden lg:inline text-[11px] text-muted-foreground shrink-0">
					signed {{ fmtDate(c.signed_at) }}
				</span>
				<span v-else-if="fmtDate(c.valid_until)" class="hidden lg:inline text-[11px] text-muted-foreground shrink-0">
					valid {{ fmtDate(c.valid_until) }}
				</span>
				<span
					v-if="c.contract_status"
					class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0"
					:style="{ color: statusColor(c.contract_status), backgroundColor: statusColor(c.contract_status) + '18' }"
				>{{ statusLabel(c.contract_status) }}</span>
				<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
			</button>
		</div>
	</div>
</template>
