<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Contracts | Client Portal' });

const { selectedOrg } = useOrganization();
const { user } = useDirectusAuth();
const toast = useToast();

const contractItems = usePortalItems('contracts');

const loading = ref(true);
const contracts = ref<any[]>([]);

// In-portal sign flow — opens an inline modal where the client types name
// + email + checks the affirm box. Avoids the email-token roundtrip when the
// client is already signed in to the portal.
const signTarget = ref<any | null>(null);
const signing = ref(false);
const signForm = reactive({ name: '', email: '', affirm: false });

const statusConfig: Record<string, { label: string; classes: string; icon: string }> = {
	draft:   { label: 'Draft',    classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',      icon: 'lucide:file' },
	sent:    { label: 'Sent',     classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',   icon: 'lucide:send' },
	signed:  { label: 'Signed',   classes: 'bg-success/10 text-success dark:bg-success/30 dark:text-success', icon: 'lucide:check-circle-2' },
	void:    { label: 'Void',     classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',      icon: 'lucide:x-circle' },
	expired: { label: 'Expired',  classes: 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning', icon: 'lucide:clock' },
};

async function loadContracts() {
	if (!selectedOrg.value) return;
	loading.value = true;

	try {
		contracts.value = await contractItems.list({
			filter: {
				_and: [
					{ organization: { _eq: selectedOrg.value } },
					{ contract_status: { _nin: ['draft'] } },
				],
			},
			fields: [
				'id',
				'title',
				'contract_status',
				'date_created',
				'date_updated',
				'contact.first_name',
				'contact.last_name',
				'contact.company',
				'proposal.id',
				'proposal.title',
			],
			sort: ['-date_created'],
			limit: 100,
		});
	} catch (err) {
		console.error('Failed to load contracts:', err);
	} finally {
		loading.value = false;
	}
}

function formatDate(d: string) {
	if (!d) return '—';
	return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function openSign(contract: any, evt?: MouseEvent) {
	evt?.preventDefault();
	evt?.stopPropagation();
	signTarget.value = contract;
	signForm.name = `${user.value?.first_name || ''} ${user.value?.last_name || ''}`.trim();
	signForm.email = user.value?.email || '';
	signForm.affirm = false;
}

function closeSign() {
	if (signing.value) return;
	signTarget.value = null;
}

async function submitSign() {
	if (!signTarget.value || signing.value) return;
	signing.value = true;
	try {
		await $fetch('/api/portal/contract-sign', {
			method: 'POST',
			body: {
				contractId: signTarget.value.id,
				name: signForm.name.trim(),
				email: signForm.email.trim(),
				signature_data: signForm.name.trim(),
				affirm: signForm.affirm,
			},
		});
		signTarget.value.contract_status = 'signed';
		toast.add({ title: 'Contract signed', color: 'green' });
		signTarget.value = null;
	} catch (err: any) {
		toast.add({
			title: 'Could not sign',
			description: err?.data?.message || err?.message || 'Try again or open the sign link from your email.',
			color: 'red',
		});
	} finally {
		signing.value = false;
	}
}

onMounted(() => loadContracts());
watch(() => selectedOrg.value, () => loadContracts());
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Contracts" />

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-6 -mt-1">View and sign your contracts.</p>

			<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!contracts.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:file-badge" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No contracts yet.</p>
		</div>

		<!-- Contract List -->
		<div v-else class="space-y-2">
			<NuxtLink
				v-for="contract in contracts"
				:key="contract.id"
				:to="`/portal/contracts/${contract.id}`"
				class="ios-card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group"
			>
				<div class="flex items-center justify-center w-10 h-10 rounded-full bg-muted/60 shrink-0">
					<Icon
						:name="(statusConfig[contract.contract_status] ?? statusConfig.draft).icon"
						class="w-5 h-5"
						:class="contract.contract_status === 'signed' ? 'text-success' : 'text-muted-foreground'"
					/>
				</div>

				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2 mb-0.5">
						<span class="text-sm font-medium truncate">{{ contract.title || 'Contract' }}</span>
						<span
							class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full shrink-0"
							:class="(statusConfig[contract.contract_status] ?? statusConfig.draft).classes"
						>
							{{ statusConfig[contract.contract_status]?.label ?? contract.contract_status }}
						</span>
					</div>
					<div class="flex items-center gap-3 text-xs text-muted-foreground">
						<span v-if="contract.contact?.first_name">
							{{ contract.contact.first_name }} {{ contract.contact.last_name }}
							<template v-if="contract.contact.company"> · {{ contract.contact.company }}</template>
						</span>
						<span>{{ formatDate(contract.date_created) }}</span>
					</div>
					<p v-if="contract.proposal?.title" class="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
						<Icon name="lucide:link" class="w-3 h-3" />
						{{ contract.proposal.title }}
					</p>
				</div>

				<!-- Sign CTA for sent contracts — clicking opens an inline modal
				     instead of bouncing through the email token route. -->
				<div class="shrink-0 flex items-center gap-1.5">
					<button
						v-if="contract.contract_status === 'sent'"
						class="text-xs font-medium text-white bg-primary hover:bg-primary/90 transition-colors px-3 py-1.5 rounded-full"
						@click="openSign(contract, $event)"
					>
						Sign
					</button>
					<Icon v-else name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
				</div>
			</NuxtLink>
		</div>

		<!-- Sign modal -->
		<Teleport to="body">
			<Transition name="fade">
				<div
					v-if="signTarget"
					class="fixed inset-0 z-50 flex items-center justify-center p-4"
				>
					<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeSign" />
					<div class="relative w-full max-w-md ios-card p-5 space-y-4 bg-background">
						<div class="flex items-start justify-between gap-3">
							<div>
								<h2 class="text-base font-semibold">Sign contract</h2>
								<p class="text-xs text-muted-foreground mt-0.5">{{ signTarget.title || 'Contract' }}</p>
							</div>
							<button class="p-1.5 rounded-lg hover:bg-muted/60" :disabled="signing" @click="closeSign">
								<Icon name="lucide:x" class="w-5 h-5" />
							</button>
						</div>

						<NuxtLink
							:to="`/portal/contracts/${signTarget.id}`"
							class="block text-[11px] text-primary hover:underline"
						>
							Read the full contract first
						</NuxtLink>

						<div class="space-y-2">
							<label class="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your name</label>
							<input
								v-model="signForm.name"
								type="text"
								placeholder="Full legal name"
								class="w-full text-sm rounded-lg bg-muted/30 border border-border/40 focus:border-primary/40 focus:outline-none px-3 py-2"
								:disabled="signing"
							/>
						</div>
						<div class="space-y-2">
							<label class="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your email</label>
							<input
								v-model="signForm.email"
								type="email"
								placeholder="you@example.com"
								class="w-full text-sm rounded-lg bg-muted/30 border border-border/40 focus:border-primary/40 focus:outline-none px-3 py-2"
								:disabled="signing"
							/>
						</div>

						<label class="flex items-start gap-2 text-[12px] leading-snug text-muted-foreground cursor-pointer">
							<input v-model="signForm.affirm" type="checkbox" :disabled="signing" class="mt-0.5" />
							<span>
								I affirm that typing my name above constitutes my electronic signature on this contract,
								and that I'm authorised to sign on behalf of the listed client.
							</span>
						</label>

						<div class="flex justify-end gap-2 pt-2 border-t border-border/30">
							<button
								class="text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full"
								:disabled="signing"
								@click="closeSign"
							>
								Cancel
							</button>
							<button
								class="text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors px-4 py-1.5 rounded-full"
								:disabled="!signForm.name.trim() || !signForm.email.trim() || !signForm.affirm || signing"
								@click="submitSign"
							>
								<span v-if="signing">Signing…</span>
								<span v-else>Sign contract</span>
							</button>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>
		</LayoutPageContainer>
	</div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
