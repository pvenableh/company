<!--
  ContractPanel — slide-over body for a single contract.

  Two modes:
    - 'view'  (default) — status, value, dates, linked records, block outline.
                          Used as quick-look surface; row click opens this.
    - 'edit'           — embeds the typed-block composer (BlockComposer)
                          with a sticky save bar in the panel footer. Used
                          for the post-create handoff and the "Edit" action.

  Heavy chrome (PDF preview, signing portal, theme settings) still lives at
  /contracts/[id] — the "Full Page ↗" action chip is the escape hatch when
  the slide-over column feels too narrow.

  Cross-panel push: linked contact opens its own panel on top via
  `useAppSlideOverStack().push('contact', id)`. Linked source proposal
  pushes a `proposal` panel — exercises proposal↔contract stacking.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from '~~/shared/contracts';
import { formatCurrency } from '~/utils/currency';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { getContract } = useContracts();
const { push } = useAppSlideOverStack();
const toast = useToast();
const contractItems = useDirectusItems('contracts');

const contract = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const editing = ref(props.mode === 'edit');
const blocks = ref<any[]>([]);
const blocksDirty = ref(false);
const savingBlocks = ref(false);

const statusLabel = computed(() => {
	const s = contract.value?.contract_status as keyof typeof CONTRACT_STATUS_LABELS | undefined;
	return s ? CONTRACT_STATUS_LABELS[s] : null;
});
const statusColor = computed(() => {
	const s = contract.value?.contract_status as keyof typeof CONTRACT_STATUS_COLORS | undefined;
	return s ? CONTRACT_STATUS_COLORS[s] : '#6B7280';
});

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
	blocks.value = [];
	blocksDirty.value = false;
	try {
		contract.value = await getContract(id);
		blocks.value = Array.isArray(contract.value?.blocks) ? contract.value.blocks : [];
	} catch (err: any) {
		error.value = err?.message || 'Failed to load contract';
	} finally {
		loading.value = false;
	}
}

watch(() => props.id, load, { immediate: true });

// Honor the URL-driven mode on subsequent navigations (e.g. push with mode='edit'
// while panel already open with same id).
watch(() => props.mode, (m) => { editing.value = m === 'edit'; });

function onBlocksChange(next: any[]) {
	blocks.value = next;
	blocksDirty.value = true;
}

async function saveBlocks() {
	if (!contract.value?.id || savingBlocks.value) return;
	savingBlocks.value = true;
	try {
		await contractItems.update(contract.value.id, { blocks: blocks.value });
		contract.value = { ...contract.value, blocks: [...blocks.value] };
		blocksDirty.value = false;
		toast.add({ title: 'Saved', color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Failed to save blocks', description: err.message, color: 'red' });
	} finally {
		savingBlocks.value = false;
	}
}

async function exitEdit() {
	if (blocksDirty.value) {
		if (!confirm('Discard unsaved block changes?')) return;
		blocks.value = Array.isArray(contract.value?.blocks) ? [...contract.value.blocks] : [];
		blocksDirty.value = false;
	}
	editing.value = false;
}

function startEdit() {
	editing.value = true;
}

function onShellClose() {
	if (editing.value && blocksDirty.value) {
		if (!confirm('You have unsaved block changes. Close anyway?')) return;
	}
	emit('close');
}

// Last-ditch save attempt on unmount when the user dismissed via backdrop /
// escape (which bypasses onShellClose). Fire-and-forget — toast handles UX.
onBeforeUnmount(() => {
	if (editing.value && blocksDirty.value && contract.value?.id) {
		contractItems.update(contract.value.id, { blocks: blocks.value }).catch(() => {});
	}
});

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
		@close="onShellClose"
	>
		<template v-if="contract" #actions>
			<button
				v-if="!editing"
				type="button"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
				@click="startEdit"
			>
				<Icon name="lucide:pencil" class="w-3 h-3" />
				Edit
			</button>
			<button
				v-else
				type="button"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				@click="exitEdit"
			>
				<Icon name="lucide:eye" class="w-3 h-3" />
				View
			</button>
			<NuxtLink
				:to="editing ? `/contracts/${contract.id}?edit=1` : `/contracts/${contract.id}`"
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

		<!-- ── EDIT MODE ── -->
		<div v-else-if="contract && editing" class="space-y-3">
			<div class="rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 flex items-start gap-2 text-xs text-muted-foreground">
				<Icon name="lucide:info" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
				<span>Compose the body with typed blocks. Use <strong>Full Page ↗</strong> for PDF preview &amp; signing.</span>
			</div>
			<DocumentsBlockComposer
				:model-value="blocks"
				applies-to="contracts"
				:saving="savingBlocks"
				@update:model-value="onBlocksChange"
			/>
		</div>

		<!-- ── VIEW MODE ── -->
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
						<span class="truncate">{{ b?.payload?.heading || b.heading || (b?.payload?.body_markdown ? String(b.payload.body_markdown).slice(0, 60) : 'Untitled block') }}</span>
					</li>
				</ol>
				<button
					v-else
					type="button"
					class="w-full rounded-md border border-dashed border-muted-foreground/30 px-3 py-3 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
					@click="startEdit"
				>
					No content yet — click to compose blocks
				</button>
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

		<template v-if="editing && contract" #footer>
			<div class="flex items-center justify-between gap-3">
				<span class="text-xs text-muted-foreground">
					<span v-if="blocksDirty">Unsaved changes</span>
					<span v-else>All changes saved</span>
				</span>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="text-xs h-7 px-3 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
						@click="exitEdit"
					>
						Done
					</button>
					<button
						type="button"
						class="text-xs h-7 px-3 rounded-full font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						:disabled="!blocksDirty || savingBlocks"
						@click="saveBlocks"
					>
						<Icon v-if="savingBlocks" name="lucide:loader-2" class="w-3 h-3 mr-1 inline animate-spin" />
						Save
					</button>
				</div>
			</div>
		</template>
	</AppSlideOverShell>
</template>
