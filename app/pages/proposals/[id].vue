<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';
import type { ProposalStatus } from '~~/shared/proposals-enhanced';

definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const proposalId = computed(() => route.params.id as string);

const { getProposal, updateProposalStatus, update } = useProposals();

const proposal = ref<any>(null);
const loading = ref(true);
const editing = ref(false);
const saving = ref(false);
const statusUpdating = ref(false);

const statusOptions = Object.entries(PROPOSAL_STATUS_LABELS).map(([value, label]) => ({ value, label }));

async function fetchData() {
	loading.value = true;
	try {
		proposal.value = await getProposal(proposalId.value);
		useHead({ title: `${proposal.value?.title || 'Proposal'} | Earnest` });
	} catch (e) {
		console.error('Failed to load proposal:', e);
	} finally {
		loading.value = false;
	}
}

async function handleStatusChange(status: ProposalStatus) {
	statusUpdating.value = true;
	try {
		await updateProposalStatus(proposalId.value, status);
		proposal.value.proposal_status = status;
	} finally {
		statusUpdating.value = false;
	}
}

async function handleUpdate(data: any) {
	saving.value = true;
	try {
		await update(proposalId.value, data);
		editing.value = false;
		await fetchData();
	} finally {
		saving.value = false;
	}
}

onMounted(fetchData);
</script>

<template>
	<div class="page__inner px-6 max-w-5xl mx-auto">
		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>

		<template v-else-if="proposal">
			<!-- Back + Header -->
			<div class="mb-6">
				<NuxtLink to="/proposals" class="text-xs t-text-muted hover:t-text-secondary flex items-center gap-1 mb-3">
					<UIcon name="i-heroicons-arrow-left" class="w-3 h-3" /> Back to proposals
				</NuxtLink>
				<div class="flex items-start justify-between">
					<div>
						<h1 class="text-xl font-bold t-text">{{ proposal.title || 'Untitled Proposal' }}</h1>
						<p class="text-sm t-text-secondary">
							{{ proposal.organization?.name }}
							<span v-if="proposal.contact"> · {{ proposal.contact.first_name }} {{ proposal.contact.last_name }}</span>
						</p>
					</div>
					<UButton v-if="!editing" size="sm" variant="outline" icon="i-heroicons-pencil" @click="editing = true">
						Edit
					</UButton>
				</div>
			</div>

			<!-- Edit Form -->
			<div v-if="editing" class="ios-card p-6 mb-6">
				<ProposalsProposalForm
					:proposal="proposal"
					:saving="saving"
					@submit="handleUpdate"
					@cancel="editing = false"
				/>
			</div>

			<!-- View Mode -->
			<div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Details -->
				<div class="lg:col-span-1 space-y-4">
					<div class="ios-card p-4">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider mb-2">Status</p>
						<USelectMenu
							:model-value="proposal.proposal_status"
							:options="statusOptions"
							value-attribute="value"
							option-attribute="label"
							size="sm"
							:loading="statusUpdating"
							@update:model-value="handleStatusChange"
						/>
					</div>

					<div class="ios-card p-4 space-y-3">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Details</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div>
								<p class="t-text-muted">Value</p>
								<p class="font-medium t-text">{{ proposal.total_value ? `$${Number(proposal.total_value).toLocaleString()}` : '—' }}</p>
							</div>
							<div>
								<p class="t-text-muted">Expires</p>
								<p class="font-medium t-text">{{ proposal.valid_until ? new Date(proposal.valid_until).toLocaleDateString() : '—' }}</p>
							</div>
							<div>
								<p class="t-text-muted">Sent</p>
								<p class="font-medium t-text">{{ proposal.date_sent ? new Date(proposal.date_sent).toLocaleDateString() : '—' }}</p>
							</div>
							<div>
								<p class="t-text-muted">Created</p>
								<p class="font-medium t-text">{{ proposal.date_created ? new Date(proposal.date_created).toLocaleDateString() : '—' }}</p>
							</div>
						</div>
					</div>

					<!-- Contact -->
					<div v-if="proposal.contact" class="ios-card p-4 space-y-2">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Contact</p>
						<p class="text-sm font-medium t-text">{{ proposal.contact.first_name }} {{ proposal.contact.last_name }}</p>
						<p v-if="proposal.contact.email" class="text-xs t-text-secondary">{{ proposal.contact.email }}</p>
						<p v-if="proposal.contact.phone" class="text-xs t-text-secondary">{{ proposal.contact.phone }}</p>
					</div>

					<!-- Linked Lead -->
					<div v-if="proposal.lead" class="ios-card p-4">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider mb-2">Linked Lead</p>
						<NuxtLink :to="`/leads/${proposal.lead.id}`" class="text-sm text-primary hover:underline">
							View lead →
						</NuxtLink>
					</div>
				</div>

				<!-- Notes -->
				<div class="lg:col-span-2">
					<div class="ios-card p-6">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider mb-3">Proposal Content</p>
						<div v-if="proposal.notes" class="prose prose-sm dark:prose-invert max-w-none" v-html="proposal.notes" />
						<p v-else class="text-sm t-text-muted">No content yet. Click Edit to add proposal details.</p>
					</div>

					<!-- File -->
					<div v-if="proposal.file" class="ios-card p-4 mt-4 flex items-center gap-3">
						<UIcon name="i-heroicons-paper-clip" class="w-5 h-5 t-text-muted" />
						<div>
							<p class="text-sm font-medium t-text">{{ proposal.file.title || 'Attachment' }}</p>
							<p class="text-[10px] t-text-muted">{{ proposal.file.type }}</p>
						</div>
					</div>
				</div>
			</div>
		</template>
	</div>
</template>
