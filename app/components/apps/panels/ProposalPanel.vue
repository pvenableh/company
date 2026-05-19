<!--
  ProposalPanel — slide-over body for a single proposal.

  Two modes:
    - 'view'  (default) — status, value, expiry, linked records, block outline.
                          Quick-look surface used for row clicks.
    - 'edit'           — embeds the typed-block composer (BlockComposer)
                          with a sticky save bar in the panel footer.

  Heavy chrome (PDF preview, theme settings, send flow) stays at
  /proposals/[id] — the "Full Page ↗" action chip is the escape hatch.

  Cross-panel push: clicking the linked contact opens its panel on top
  via `useAppSlideOverStack().push()`.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from '~~/shared/proposals-enhanced';
import { formatCurrency } from '~/utils/currency';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { getProposal } = useProposals();
const { push } = useAppSlideOverStack();
const toast = useToast();
const proposalItems = useDirectusItems('proposals');

const proposal = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const editing = ref(props.mode === 'edit');
const blocks = ref<any[]>([]);
const blocksDirty = ref(false);
const savingBlocks = ref(false);

const statusLabel = computed(() => {
	const s = proposal.value?.proposal_status as keyof typeof PROPOSAL_STATUS_LABELS | undefined;
	return s ? PROPOSAL_STATUS_LABELS[s] : null;
});
const statusColor = computed(() => {
	const s = proposal.value?.proposal_status as keyof typeof PROPOSAL_STATUS_COLORS | undefined;
	return s ? PROPOSAL_STATUS_COLORS[s] : '#6B7280';
});

const linkedContact = computed(() => {
	const p = proposal.value;
	if (!p) return null;
	if (p.contact?.id) return { id: p.contact.id, name: `${p.contact.first_name || ''} ${p.contact.last_name || ''}`.trim() || 'Contact' };
	if (p.lead?.related_contact?.id) {
		const c = p.lead.related_contact;
		return { id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Contact' };
	}
	return null;
});

function fmtDate(d: string | null | undefined) {
	if (!d) return null;
	try { return new Date(d).toLocaleDateString(); } catch { return null; }
}

async function load(id: string) {
	if (!id) return;
	loading.value = true;
	error.value = null;
	proposal.value = null;
	blocks.value = [];
	blocksDirty.value = false;
	try {
		proposal.value = await getProposal(id);
		blocks.value = Array.isArray(proposal.value?.blocks) ? proposal.value.blocks : [];
	} catch (err: any) {
		error.value = err?.message || 'Failed to load proposal';
	} finally {
		loading.value = false;
	}
}

watch(() => props.id, load, { immediate: true });
watch(() => props.mode, (m) => { editing.value = m === 'edit'; });

function onBlocksChange(next: any[]) {
	blocks.value = next;
	blocksDirty.value = true;
}

async function saveBlocks() {
	if (!proposal.value?.id || savingBlocks.value) return;
	savingBlocks.value = true;
	try {
		await proposalItems.update(proposal.value.id, { blocks: blocks.value });
		proposal.value = { ...proposal.value, blocks: [...blocks.value] };
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
		blocks.value = Array.isArray(proposal.value?.blocks) ? [...proposal.value.blocks] : [];
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

onBeforeUnmount(() => {
	if (editing.value && blocksDirty.value && proposal.value?.id) {
		proposalItems.update(proposal.value.id, { blocks: blocks.value }).catch(() => {});
	}
});

function openContact() {
	if (linkedContact.value) push('contact', linkedContact.value.id);
}
</script>

<template>
	<AppSlideOverShell
		:title="proposal?.title || 'Proposal'"
		:subtitle="proposal?.organization?.name"
		@close="onShellClose"
	>
		<template v-if="proposal" #actions>
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
				:to="editing ? `/proposals/${proposal.id}?edit=1` : `/proposals/${proposal.id}`"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				:title="`Open full page for ${proposal.title || 'proposal'}`"
			>
				<Icon name="lucide:external-link" class="w-3 h-3" />
				Full Page
			</NuxtLink>
		</template>

		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading proposal…</p>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">
			{{ error }}
		</div>

		<!-- ── EDIT MODE ── -->
		<div v-else-if="proposal && editing" class="space-y-3">
			<div class="rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 flex items-start gap-2 text-xs text-muted-foreground">
				<Icon name="lucide:info" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
				<span>Compose the body with typed blocks. Use <strong>Full Page ↗</strong> for PDF preview &amp; send.</span>
			</div>
			<DocumentsBlockComposer
				:model-value="blocks"
				applies-to="proposals"
				:saving="savingBlocks"
				@update:model-value="onBlocksChange"
			/>
		</div>

		<!-- ── VIEW MODE ── -->
		<div v-else-if="proposal" class="space-y-5">
			<!-- Status + value strip -->
			<div class="flex items-center justify-between gap-3 flex-wrap">
				<span
					v-if="statusLabel"
					class="text-[11px] font-semibold px-2.5 py-1 rounded-full"
					:style="{ color: statusColor, backgroundColor: statusColor + '18' }"
				>{{ statusLabel }}</span>
				<span v-if="proposal.total_value != null" class="text-base font-semibold tabular-nums">
					{{ formatCurrency(Number(proposal.total_value), { hideZeros: true }) }}
				</span>
			</div>

			<!-- Key dates -->
			<dl v-if="fmtDate(proposal.valid_until) || fmtDate(proposal.date_sent) || fmtDate(proposal.date_created)" class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
				<div v-if="fmtDate(proposal.date_created)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Created</dt>
					<dd>{{ fmtDate(proposal.date_created) }}</dd>
				</div>
				<div v-if="fmtDate(proposal.date_sent)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</dt>
					<dd>{{ fmtDate(proposal.date_sent) }}</dd>
				</div>
				<div v-if="fmtDate(proposal.valid_until)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Valid until</dt>
					<dd>{{ fmtDate(proposal.valid_until) }}</dd>
				</div>
			</dl>

			<!-- Linkages -->
			<div v-if="linkedContact || proposal.lead?.id" class="space-y-2 pt-3 border-t border-border/30">
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
					<NuxtLink
						v-if="proposal.lead?.id"
						:to="`/leads/${proposal.lead.id}`"
						class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-border hover:bg-muted/60 transition-colors"
					>
						<Icon name="lucide:target" class="w-3 h-3" />
						Lead #{{ proposal.lead.id }}
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
			<div v-if="proposal.notes" class="space-y-1 pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
				<p class="text-sm whitespace-pre-wrap">{{ proposal.notes }}</p>
			</div>
		</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load proposal.
		</div>

		<template v-if="editing && proposal" #footer>
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
