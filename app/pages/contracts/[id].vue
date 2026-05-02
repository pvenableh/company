<script setup lang="ts">
import { CONTRACT_STATUS_LABELS } from '~~/shared/contracts';

definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const router = useRouter();
const contractId = computed(() => route.params.id as string);

const { getContract } = useContracts();
const { getStatusBadgeClasses } = useStatusStyle();

const contract = ref<any>(null);
const loading = ref(true);
const showEditModal = ref(false);
const contractItems = useDirectusItems('contracts');
const toast = useToast();

const blocks = ref<any[]>([]);
const blocksDirty = ref(false);
const savingBlocks = ref(false);

async function fetchData() {
	loading.value = true;
	try {
		contract.value = await getContract(contractId.value);
		blocks.value = Array.isArray(contract.value?.blocks) ? contract.value.blocks : [];
		blocksDirty.value = false;
		useHead({ title: `${contract.value?.title || 'Contract'} | Earnest` });
	} catch (e) {
		console.error('Failed to load contract:', e);
	} finally {
		loading.value = false;
	}
}

function onBlocksChange(next: any[]) {
	blocks.value = next;
	blocksDirty.value = true;
}

async function saveBlocks() {
	if (!contract.value?.id || savingBlocks.value) return;
	savingBlocks.value = true;
	try {
		await contractItems.update(contract.value.id, { blocks: blocks.value });
		blocksDirty.value = false;
		toast.add({ title: 'Saved', color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Failed to save blocks', description: err.message, color: 'red' });
	} finally {
		savingBlocks.value = false;
	}
}

function onContractUpdated(updated: any) {
	contract.value = { ...contract.value, ...updated };
}

function onContractDeleted() {
	router.push('/contracts');
}

const sendingForSignature = ref(false);
async function sendForSignature() {
	if (!contract.value?.id || sendingForSignature.value) return;
	sendingForSignature.value = true;
	try {
		const patch: Record<string, any> = { contract_status: 'sent' };
		if (!contract.value.signing_token) {
			patch.signing_token = crypto.randomUUID();
		}
		if (!contract.value.date_sent) {
			patch.date_sent = new Date().toISOString().split('T')[0];
		}
		const updated = await contractItems.update(contract.value.id, patch);
		contract.value = { ...contract.value, ...updated };
		const url = `${window.location.origin}/contracts/sign/${contract.value.signing_token}`;
		await navigator.clipboard.writeText(url).catch(() => {});
		toast.add({
			title: 'Marked as sent',
			description: 'Signing link copied to clipboard',
			color: 'green',
		});
	} catch (err: any) {
		toast.add({ title: 'Failed', description: err.message, color: 'red' });
	} finally {
		sendingForSignature.value = false;
	}
}

onMounted(fetchData);
</script>

<template>
	<LayoutPageContainer>
		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>

		<template v-else-if="contract">
			<NuxtLink
				to="/contracts"
				class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
			>
				<UIcon name="lucide:chevron-left" class="w-3 h-3" />
				Contracts
			</NuxtLink>

			<div class="flex items-center justify-between mb-5">
				<div>
					<div class="flex items-center gap-2">
						<h1 class="text-base font-semibold">{{ contract.title || 'Untitled Contract' }}</h1>
						<span
							v-if="contract.contract_status"
							class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
							:class="getStatusBadgeClasses(contract.contract_status)"
						>
							{{ CONTRACT_STATUS_LABELS[contract.contract_status as keyof typeof CONTRACT_STATUS_LABELS] || contract.contract_status }}
						</span>
					</div>
					<p class="text-xs text-muted-foreground">
						{{ contract.organization?.name }}
						<span v-if="contract.contact"> · {{ contract.contact.first_name }} {{ contract.contact.last_name }}</span>
					</p>
				</div>
				<div class="flex items-center gap-1.5">
					<NuxtLink
						:to="`/contracts/preview/${contract.id}`"
						target="_blank"
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
					>
						<UIcon name="lucide:eye" class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Preview</span>
					</NuxtLink>
					<button
						v-if="contract.contract_status === 'draft'"
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
						:disabled="sendingForSignature"
						@click="sendForSignature"
					>
						<UIcon
							:name="sendingForSignature ? 'lucide:loader-2' : 'lucide:send'"
							class="w-3.5 h-3.5"
							:class="sendingForSignature ? 'animate-spin' : ''"
						/>
						Send for signature
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

			<!-- Signing-link callout when sent -->
			<div
				v-if="contract.contract_status === 'sent' && contract.signing_token"
				class="ios-card p-4 mb-4 flex items-center justify-between gap-3"
			>
				<div class="min-w-0">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Public signing link</p>
					<p class="text-xs t-text truncate">{{ `/contracts/sign/${contract.signing_token}` }}</p>
				</div>
				<button
					class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted shrink-0"
					@click="$event => { navigator.clipboard.writeText(window.location.origin + '/contracts/sign/' + contract.signing_token); toast.add({ title: 'Copied', color: 'green' }) }"
				>
					<UIcon name="lucide:copy" class="w-3.5 h-3.5" />
					Copy link
				</button>
			</div>

			<!-- Signed callout -->
			<div
				v-if="contract.contract_status === 'signed'"
				class="ios-card p-4 mb-4 border-l-4 border-l-green-500"
			>
				<p class="text-[10px] uppercase tracking-wider text-green-700 dark:text-green-400">Signed</p>
				<p class="text-sm t-text mt-0.5">
					{{ contract.signed_by_name }} <span class="text-muted-foreground">&lt;{{ contract.signed_by_email }}&gt;</span>
				</p>
				<p class="text-xs text-muted-foreground">
					{{ contract.signed_at ? new Date(contract.signed_at).toLocaleString() : '' }}
				</p>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div class="lg:col-span-1 space-y-4">
					<div class="ios-card p-5 space-y-3">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Details</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Value</p>
								<p class="font-medium t-text">{{ contract.total_value ? `$${Number(contract.total_value).toLocaleString()}` : '\u2014' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Effective</p>
								<p class="font-medium t-text">{{ contract.effective_date ? new Date(contract.effective_date).toLocaleDateString() : '\u2014' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</p>
								<p class="font-medium t-text">{{ contract.date_sent ? new Date(contract.date_sent).toLocaleDateString() : '\u2014' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Expires</p>
								<p class="font-medium t-text">{{ contract.valid_until ? new Date(contract.valid_until).toLocaleDateString() : '\u2014' }}</p>
							</div>
						</div>
					</div>

					<div v-if="contract.contact" class="ios-card p-5 space-y-2">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contact</p>
						<p class="text-sm font-medium t-text">{{ contract.contact.first_name }} {{ contract.contact.last_name }}</p>
						<p v-if="contract.contact.email" class="text-xs t-text-secondary">{{ contract.contact.email }}</p>
					</div>

					<div v-if="contract.proposal" class="ios-card p-5">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Source Proposal</p>
						<NuxtLink :to="`/proposals/${contract.proposal.id}`" class="text-sm text-primary hover:underline">
							{{ contract.proposal.title || 'View proposal' }} &rarr;
						</NuxtLink>
					</div>
				</div>

				<div class="lg:col-span-2 space-y-4">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contract Body</p>
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
						applies-to="contracts"
						:saving="savingBlocks"
						@update:model-value="onBlocksChange"
					/>
				</div>
			</div>

			<ContractsFormModal
				v-model="showEditModal"
				:contract="contract"
				@updated="onContractUpdated"
				@deleted="onContractDeleted"
			/>
		</template>
	</LayoutPageContainer>
</template>
