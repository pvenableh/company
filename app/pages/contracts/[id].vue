<script setup lang="ts">
import { CONTRACT_STATUS_LABELS } from '~~/shared/contracts';
import { shouldHideEarnestFooter } from '~~/shared/branding';

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
const config = useRuntimeConfig();

const blocks = ref<any[]>([]);
const blocksDirty = ref(false);
const savingBlocks = ref(false);

type Mode = 'view' | 'edit';
const mode = ref<Mode>('view');

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
		contract.value = { ...contract.value, blocks: [...blocks.value] };
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
		if (!contract.value.signing_token) patch.signing_token = crypto.randomUUID();
		if (!contract.value.date_sent) patch.date_sent = new Date().toISOString().split('T')[0];
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

const seller = computed(() => {
	const o: any = contract.value?.organization;
	if (!o) return null;
	return {
		name: o.name, logo: o.logo, address: o.address,
		phone: o.phone, email: o.email, website: o.website,
	};
});

const recipient = computed(() => {
	const c: any = contract.value?.contact;
	if (!c) return null;
	const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
	return {
		name: c.company || name || null,
		address: null as string | null,
		emails: c.email ? [c.email] : null,
	};
});

const docMeta = computed(() => ({
	kind: 'CONTRACT',
	code: contract.value?.id ? `C-${String(contract.value.id).slice(0, 8)}` : null,
	date: contract.value?.date_sent || contract.value?.date_created,
	dateLabel: 'Sent',
	expiresAt: contract.value?.effective_date || contract.value?.valid_until,
	expiresLabel: contract.value?.effective_date ? 'Effective' : 'Valid until',
	status: contract.value?.contract_status,
}));

const hasBlocks = computed(() => Array.isArray(contract.value?.blocks) && contract.value.blocks.length > 0);

const coverContext = computed(() => {
	const o: any = contract.value?.organization;
	const logo = o?.logo;
	const logoId = typeof logo === 'string' ? logo : logo?.id;
	return {
		logoUrl: logoId ? `${config.public.directusUrl}/assets/${logoId}?key=medium-contain` : null,
		title: contract.value?.title || null,
		recipient: recipient.value?.name || null,
		dateSent: contract.value?.date_sent || contract.value?.date_created || null,
		dateLabel: 'Sent',
		expiresAt: contract.value?.effective_date || contract.value?.valid_until || null,
		expiresLabel: contract.value?.effective_date ? 'Effective' : 'Valid until',
	};
});

const hideFooter = computed(() => shouldHideEarnestFooter({
	whitelabel: contract.value?.organization?.whitelabel,
	plan: contract.value?.organization?.plan,
}));

function formatTotal(n: number | null | undefined) {
	if (n == null) return null;
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

function copySigningLink() {
	if (!contract.value?.signing_token) return;
	navigator.clipboard.writeText(window.location.origin + '/contracts/sign/' + contract.value.signing_token);
	toast.add({ title: 'Copied', color: 'green' });
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

			<div class="flex items-center justify-between mb-5 gap-3 flex-wrap">
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<h1 class="text-base font-semibold truncate">{{ contract.title || 'Untitled Contract' }}</h1>
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
				<div class="flex items-center gap-1.5 flex-wrap">
					<div class="inline-flex items-center rounded-lg border border-border bg-background p-0.5 text-xs">
						<button
							class="h-6 px-2.5 rounded-md transition-colors"
							:class="mode === 'view' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
							@click="mode = 'view'"
						>
							<UIcon name="lucide:eye" class="w-3.5 h-3.5 inline -mt-0.5" />
							<span class="ml-1 hidden sm:inline">View</span>
						</button>
						<button
							class="h-6 px-2.5 rounded-md transition-colors"
							:class="mode === 'edit' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
							@click="mode = 'edit'"
						>
							<UIcon name="lucide:pencil" class="w-3.5 h-3.5 inline -mt-0.5" />
							<span class="ml-1 hidden sm:inline">Edit</span>
						</button>
					</div>

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
						<span class="hidden sm:inline">Send for signature</span>
					</button>
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
						@click="showEditModal = true"
					>
						<UIcon name="lucide:settings-2" class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Details</span>
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
					@click="copySigningLink"
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

			<!-- Save bar (sticky) when editing blocks -->
			<div
				v-if="mode === 'edit' && blocksDirty"
				class="sticky top-2 z-30 mb-4 flex items-center justify-between gap-2 ios-card p-2.5 bg-amber-50/90 dark:bg-amber-900/30 border-amber-300/40"
			>
				<p class="text-xs text-amber-800 dark:text-amber-200">Unsaved changes to contract blocks.</p>
				<button
					class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
					:disabled="savingBlocks"
					@click="saveBlocks"
				>
					<UIcon
						:name="savingBlocks ? 'lucide:loader-2' : 'lucide:save'"
						class="w-3.5 h-3.5"
						:class="savingBlocks ? 'animate-spin' : ''"
					/>
					Save
				</button>
			</div>

			<!-- VIEW mode -->
			<div v-if="mode === 'view'" class="w-full flex flex-col items-center justify-start">
				<DocumentsDocumentShell
					:seller="contract.organization"
					wrapper-class="px-6 pt-12 pb-16 w-full max-w-3xl proposal contract-doc"
				>
					<DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta">
						<template #actions>
							<ClientOnly>
								<DocumentsDocumentPdfGenerator
									:filename="(contract.title || 'contract').replace(/\s+/g, '-')"
									selector=".doc-shell.contract-doc"
									data-pdf-strip
								/>
							</ClientOnly>
						</template>
					</DocumentsDocumentHeader>

					<div v-if="contract.total_value != null" class="mt-6 mb-2 flex items-center justify-between pt-4 doc__total-rule" style="border-top: 1px solid var(--doc-rule);">
						<p class="text-[10px] uppercase tracking-wider opacity-60">Total value</p>
						<p class="text-xl font-bold">{{ formatTotal(contract.total_value) }}</p>
					</div>

					<div v-if="hasBlocks" class="mt-8">
						<DocumentsBlockRenderer :blocks="contract.blocks" :cover="coverContext" />
					</div>
					<div v-else class="mt-12 text-center opacity-50 text-sm">
						This contract has no content yet — switch to Edit mode to add blocks.
					</div>

					<div
						v-if="contract.contract_status === 'signed'"
						class="mt-8 pt-6"
						style="border-top: 1px solid var(--doc-rule);"
					>
						<p class="text-[10px] uppercase tracking-wider opacity-60">Signed</p>
						<p class="text-sm font-medium mt-0.5">
							{{ contract.signed_by_name }}
							<span class="opacity-60 text-xs">&lt;{{ contract.signed_by_email }}&gt;</span>
						</p>
						<p class="text-xs opacity-60">{{ contract.signed_at ? new Date(contract.signed_at).toLocaleString() : '' }}</p>
					</div>

					<DocumentsDocumentFooter :hidden="hideFooter" />
				</DocumentsDocumentShell>
			</div>

			<!-- EDIT mode -->
			<div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div class="lg:col-span-1 space-y-4">
					<div class="ios-card p-5 space-y-3">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Details</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Value</p>
								<p class="font-medium t-text">{{ contract.total_value ? `$${Number(contract.total_value).toLocaleString()}` : '—' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Effective</p>
								<p class="font-medium t-text">{{ contract.effective_date ? new Date(contract.effective_date).toLocaleDateString() : '—' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</p>
								<p class="font-medium t-text">{{ contract.date_sent ? new Date(contract.date_sent).toLocaleDateString() : '—' }}</p>
							</div>
							<div class="space-y-1">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Expires</p>
								<p class="font-medium t-text">{{ contract.valid_until ? new Date(contract.valid_until).toLocaleDateString() : '—' }}</p>
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
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contract Body</p>
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
