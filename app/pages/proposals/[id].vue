<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';

definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const router = useRouter();
const proposalId = computed(() => route.params.id as string);

const { getProposal } = useProposals();
const { getStatusBadgeClasses } = useStatusStyle();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const proposal = ref<any>(null);
const loading = ref(true);
const showEditModal = ref(false);
const proposalItems = useDirectusItems('proposals');
const toast = useToast();

const blocks = ref<any[]>([]);
const blocksDirty = ref(false);
const savingBlocks = ref(false);

async function fetchData() {
	loading.value = true;
	try {
		proposal.value = await getProposal(proposalId.value);
		blocks.value = Array.isArray(proposal.value?.blocks) ? proposal.value.blocks : [];
		blocksDirty.value = false;
		useHead({ title: `${proposal.value?.title || 'Proposal'} | Earnest` });
	} catch (e) {
		console.error('Failed to load proposal:', e);
	} finally {
		loading.value = false;
	}
}

function onBlocksChange(next: any[]) {
	blocks.value = next;
	blocksDirty.value = true;
}

async function saveBlocks() {
	if (!proposal.value?.id || savingBlocks.value) return;
	savingBlocks.value = true;
	try {
		await proposalItems.update(proposal.value.id, { blocks: blocks.value });
		blocksDirty.value = false;
		toast.add({ title: 'Saved', color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Failed to save blocks', description: err.message, color: 'red' });
	} finally {
		savingBlocks.value = false;
	}
}

function onProposalUpdated(updated: any) {
	proposal.value = updated;
}

function onProposalDeleted() {
	router.push('/proposals');
}

const converting = ref(false);
async function convertToContract() {
	if (!proposal.value?.id || converting.value) return;
	converting.value = true;
	try {
		const res = await $fetch(`/api/contracts/from-proposal/${proposal.value.id}`, { method: 'POST' });
		if (res?.id) {
			toast.add({ title: 'Contract drafted from proposal', color: 'green' });
			router.push(`/contracts/${res.id}`);
		}
	} catch (err: any) {
		toast.add({ title: 'Failed to convert', description: err?.data?.message || err?.message, color: 'red' });
	} finally {
		converting.value = false;
	}
}

onMounted(fetchData);

// AI sidebar lifecycle
watch(proposal, (p) => {
	if (!p) return;
	setEntity('proposal', String(p.id), p.title || 'Proposal');
}, { immediate: true });
onUnmounted(() => clearEntity());
</script>

<template>
	<div class="p-6 max-w-5xl mx-auto">
		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>

		<template v-else-if="proposal">
			<!-- Back link -->
			<NuxtLink
				to="/proposals"
				class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
			>
				<UIcon name="lucide:chevron-left" class="w-3 h-3" />
				Proposals
			</NuxtLink>

			<!-- Header -->
			<div class="flex items-center justify-between mb-5">
				<div>
					<div class="flex items-center gap-2">
						<h1 class="text-base font-semibold">{{ proposal.title || 'Untitled Proposal' }}</h1>
						<span
							v-if="proposal.proposal_status"
							class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
							:class="getStatusBadgeClasses(proposal.proposal_status)"
						>
							{{ PROPOSAL_STATUS_LABELS[proposal.proposal_status as keyof typeof PROPOSAL_STATUS_LABELS] || proposal.proposal_status }}
						</span>
					</div>
					<p class="text-xs text-muted-foreground">
						{{ proposal.organization?.name }}
						<span v-if="proposal.contact"> · {{ proposal.contact.first_name }} {{ proposal.contact.last_name }}</span>
					</p>
				</div>
				<div class="flex items-center gap-1.5">
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
						@click="sidebarOpen = true"
					>
						<UIcon name="lucide:sparkles" class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Ask Earnest</span>
					</button>
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
						:disabled="converting"
						@click="convertToContract"
					>
						<UIcon
							:name="converting ? 'lucide:loader-2' : 'lucide:file-signature'"
							class="w-3.5 h-3.5"
							:class="converting ? 'animate-spin' : ''"
						/>
						<span class="hidden sm:inline">Convert to contract</span>
					</button>
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
						@click="showEditModal = true"
					>
						<UIcon name="lucide:pencil" class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Edit</span>
					</button>
				</div>
			</div>

			<!-- AI Notices -->
			<ClientOnly>
				<AIProactiveNotices v-if="proposal?.id" entity-type="proposal" :entity-id="String(proposal.id)" />
			</ClientOnly>

			<!-- View Mode -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Sidebar: details -->
				<div class="lg:col-span-1 space-y-4">
					<div class="ios-card p-5 space-y-3">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Details</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Value</p>
								<p class="font-medium t-text">{{ proposal.total_value ? `$${Number(proposal.total_value).toLocaleString()}` : '\u2014' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Expires</p>
								<p class="font-medium t-text">{{ proposal.valid_until ? new Date(proposal.valid_until).toLocaleDateString() : '\u2014' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</p>
								<p class="font-medium t-text">{{ proposal.date_sent ? new Date(proposal.date_sent).toLocaleDateString() : '\u2014' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Created</p>
								<p class="font-medium t-text">{{ proposal.date_created ? new Date(proposal.date_created).toLocaleDateString() : '\u2014' }}</p>
							</div>
						</div>
					</div>

					<!-- Contact -->
					<div v-if="proposal.contact" class="ios-card p-5 space-y-2">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contact</p>
						<p class="text-sm font-medium t-text">{{ proposal.contact.first_name }} {{ proposal.contact.last_name }}</p>
						<p v-if="proposal.contact.email" class="text-xs t-text-secondary">{{ proposal.contact.email }}</p>
						<p v-if="proposal.contact.phone" class="text-xs t-text-secondary">{{ proposal.contact.phone }}</p>
					</div>

					<!-- Linked Lead -->
					<div v-if="proposal.lead" class="ios-card p-5">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Linked Lead</p>
						<NuxtLink :to="`/leads/${proposal.lead.id}`" class="text-sm text-primary hover:underline">
							View lead &rarr;
						</NuxtLink>
					</div>

					<!-- File -->
					<div v-if="proposal.file" class="ios-card p-5 flex items-center gap-3">
						<UIcon name="i-heroicons-paper-clip" class="w-5 h-5 t-text-muted shrink-0" />
						<div class="min-w-0">
							<p class="text-sm font-medium t-text truncate">{{ proposal.file.title || 'Attachment' }}</p>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ proposal.file.type }}</p>
						</div>
					</div>
				</div>

				<!-- Main: content -->
				<div class="lg:col-span-2 space-y-4">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Proposal Content</p>
						<button
							v-if="blocksDirty"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
							:disabled="savingBlocks"
							@click="saveBlocks"
						>
							<UIcon
								:name="savingBlocks ? 'lucide:loader-2' : 'lucide:save'"
								class="w-3.5 h-3.5"
								:class="savingBlocks ? 'animate-spin' : ''"
							/>
							Save changes
						</button>
					</div>

					<DocumentsBlockComposer
						:model-value="blocks"
						applies-to="proposals"
						:saving="savingBlocks"
						@update:model-value="onBlocksChange"
					/>

					<!-- Legacy notes (only shown if non-empty AND no blocks yet) -->
					<div
						v-if="proposal.notes && (!blocks || blocks.length === 0)"
						class="ios-card p-5 mt-2"
					>
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Notes (legacy)</p>
						<div class="prose prose-sm dark:prose-invert max-w-none" v-html="proposal.notes" />
						<p class="text-xs text-muted-foreground mt-3">
							This proposal was created before the blocks composer. Add blocks above to migrate to the new format —
							your notes stay until you remove them.
						</p>
					</div>
				</div>
			</div>

			<!-- Edit Modal -->
			<ProposalsFormModal
				v-model="showEditModal"
				:proposal="proposal"
				@updated="onProposalUpdated"
				@deleted="onProposalDeleted"
			/>
		</template>

		<!-- Contextual AI Sidebar -->
		<ClientOnly>
			<AIContextualSidebar
				v-if="sidebarOpen && proposal?.id"
				entity-type="proposal"
				:entity-id="String(proposal.id)"
				:entity-label="proposal.title || 'Proposal'"
				@close="closeSidebar"
			/>
			<Transition name="overlay">
				<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
			</Transition>
		</ClientOnly>
	</div>
</template>
