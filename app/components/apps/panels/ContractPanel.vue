<!--
  ContractPanel — slide-over body for a single contract.

  Quick-look surface: status, value, effective + expiry dates, signing
  state, linked contact/lead/source-proposal, blocks outline. Heavy
  editing + signing flow stays at /contracts/[id] (and /contracts/sign
  for the public token route).

  Cross-panel push: linked contact opens its own panel on top via
  `useAppSlideOverStack().push('contact', id)`. Linked source proposal
  pushes a `proposal` panel — exercises proposal↔contract stacking now
  that both panels exist.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from '~~/shared/contracts';
import { formatCurrency } from '~/utils/currency';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { getContract } = useContracts();
const { push } = useAppSlideOverStack();

const contract = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const statusLabel = computed(() => {
	const s = contract.value?.contract_status as keyof typeof CONTRACT_STATUS_LABELS | undefined;
	return s ? CONTRACT_STATUS_LABELS[s] : null;
});
const statusColor = computed(() => {
	const s = contract.value?.contract_status as keyof typeof CONTRACT_STATUS_COLORS | undefined;
	return s ? CONTRACT_STATUS_COLORS[s] : '#6B7280';
});

const blocks = computed<any[]>(() =>
	Array.isArray(contract.value?.blocks) ? contract.value.blocks : [],
);

const linkedContact = computed(() => {
	const c = contract.value?.contact;
	if (!c?.id) return null;
	return { id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Contact' };
});

const signed = computed(() => contract.value?.contract_status === 'signed' && contract.value?.signed_at);

function fmtDate(d: string | null | undefined) {
	if (!d) return null;
	try { return new Date(d).toLocaleDateString(); } catch { return null; }
}
function fmtDateTime(d: string | null | undefined) {
	if (!d) return null;
	try { return new Date(d).toLocaleString(); } catch { return null; }
}

async function load(id: string) {
	if (!id) return;
	loading.value = true;
	error.value = null;
	contract.value = null;
	try {
		contract.value = await getContract(id);
	} catch (err: any) {
		error.value = err?.message || 'Failed to load contract';
	} finally {
		loading.value = false;
	}
}

watch(() => props.id, load, { immediate: true });

function openContact() {
	if (linkedContact.value) push('contact', linkedContact.value.id);
}
function openProposal() {
	const pid = contract.value?.proposal?.id;
	if (pid) push('proposal', String(pid));
}
</script>

<template>
	<AppSlideOverShell
		:title="contract?.title || 'Contract'"
		:subtitle="contract?.organization?.name"
		@close="emit('close')"
	>
		<template v-if="contract" #actions>
			<NuxtLink
				:to="`/contracts/${contract.id}`"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				:title="`Open full page for ${contract.title || 'contract'}`"
			>
				<Icon name="lucide:external-link" class="w-3 h-3" />
				Full Page
			</NuxtLink>
		</template>

		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading contract…</p>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">
			{{ error }}
		</div>

		<div v-else-if="contract" class="space-y-5">
			<!-- Status + value strip -->
			<div class="flex items-center justify-between gap-3 flex-wrap">
				<span
					v-if="statusLabel"
					class="text-[11px] font-semibold px-2.5 py-1 rounded-full"
					:style="{ color: statusColor, backgroundColor: statusColor + '18' }"
				>{{ statusLabel }}</span>
				<span v-if="contract.total_value != null" class="text-base font-semibold tabular-nums">
					{{ formatCurrency(Number(contract.total_value), { hideZeros: true }) }}
				</span>
			</div>

			<!-- Signed badge -->
			<div
				v-if="signed"
				class="rounded-lg border border-success/30 bg-success/8 px-3 py-2.5 text-xs space-y-0.5"
			>
				<div class="flex items-center gap-1.5 text-success font-medium">
					<Icon name="lucide:check-circle-2" class="w-3.5 h-3.5" />
					Signed
					<span v-if="fmtDateTime(contract.signed_at)" class="text-muted-foreground font-normal">
						· {{ fmtDateTime(contract.signed_at) }}
					</span>
				</div>
				<div v-if="contract.signed_by_name" class="text-muted-foreground">
					by {{ contract.signed_by_name }}<span v-if="contract.signed_by_email"> ({{ contract.signed_by_email }})</span>
				</div>
			</div>

			<!-- Key dates -->
			<dl v-if="fmtDate(contract.effective_date) || fmtDate(contract.valid_until) || fmtDate(contract.date_sent) || fmtDate(contract.date_created)" class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
				<div v-if="fmtDate(contract.date_created)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Created</dt>
					<dd>{{ fmtDate(contract.date_created) }}</dd>
				</div>
				<div v-if="fmtDate(contract.date_sent)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</dt>
					<dd>{{ fmtDate(contract.date_sent) }}</dd>
				</div>
				<div v-if="fmtDate(contract.effective_date)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Effective</dt>
					<dd>{{ fmtDate(contract.effective_date) }}</dd>
				</div>
				<div v-if="fmtDate(contract.valid_until)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Valid until</dt>
					<dd>{{ fmtDate(contract.valid_until) }}</dd>
				</div>
			</dl>

			<!-- Linkages -->
			<div v-if="linkedContact || contract.lead?.id || contract.proposal?.id" class="space-y-2 pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Linked to</p>
				<div class="flex flex-wrap gap-2">
					<button
						v-if="linkedContact"
						type="button"
						class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-border hover:bg-muted/60 transition-colors"
						@click="openContact"
					>
						<Icon name="lucide:user" class="w-3 h-3" />
						{{ linkedContact.name }}
					</button>
					<button
						v-if="contract.proposal?.id"
						type="button"
						class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-border hover:bg-muted/60 transition-colors"
						@click="openProposal"
					>
						<Icon name="lucide:file-text" class="w-3 h-3" />
						{{ contract.proposal.title || 'Source proposal' }}
					</button>
					<NuxtLink
						v-if="contract.lead?.id"
						:to="`/leads/${contract.lead.id}`"
						class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-border hover:bg-muted/60 transition-colors"
					>
						<Icon name="lucide:target" class="w-3 h-3" />
						Lead #{{ contract.lead.id }}
					</NuxtLink>
				</div>
			</div>

			<!-- Blocks outline -->
			<div class="space-y-2 pt-3 border-t border-border/30">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Content</p>
					<span class="text-[10px] text-muted-foreground">{{ blocks.length }} block{{ blocks.length === 1 ? '' : 's' }}</span>
				</div>
				<ol v-if="blocks.length" class="space-y-1 text-sm">
					<li
						v-for="(b, i) in blocks"
						:key="b.id || i"
						class="flex items-baseline gap-2 py-1"
					>
						<span class="text-[10px] tabular-nums text-muted-foreground/70 w-5 shrink-0">{{ i + 1 }}.</span>
						<span class="truncate">{{ b.heading || (b.content ? String(b.content).slice(0, 60) : 'Untitled block') }}</span>
					</li>
				</ol>
				<p v-else class="text-xs text-muted-foreground italic">No content yet — open the full page to compose blocks.</p>
			</div>

			<!-- Notes -->
			<div v-if="contract.notes" class="space-y-1 pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
				<p class="text-sm whitespace-pre-wrap">{{ contract.notes }}</p>
			</div>
		</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load contract.
		</div>
	</AppSlideOverShell>
</template>
