<script setup lang="ts">
import { shouldHideEarnestFooter } from '~~/shared/branding';

useHead({ title: 'Sign Contract | Earnest' });

const { params } = useRoute();
const config = useRuntimeConfig();
const token = computed(() => params.token as string);

const contract = ref<any>(null);
const loading = ref(true);
const errorMsg = ref<string | null>(null);

async function load() {
	loading.value = true;
	errorMsg.value = null;
	try {
		contract.value = await $fetch(`/api/contracts/by-token/${token.value}`);
	} catch (err: any) {
		errorMsg.value = err?.data?.message || 'Could not load contract';
	} finally {
		loading.value = false;
	}
}

onMounted(load);

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
		address: null,
		emails: c.email ? [c.email] : null,
	};
});

const docMeta = computed(() => ({
	kind: 'CONTRACT',
	code: contract.value?.id ? `C-${contract.value.id.slice(0, 8)}` : null,
	date: contract.value?.date_sent,
	dateLabel: 'Sent',
	expiresAt: contract.value?.effective_date || contract.value?.valid_until,
	expiresLabel: contract.value?.effective_date ? 'Effective' : 'Valid until',
	status: contract.value?.contract_status,
}));

const hasBlocks = computed(() => Array.isArray(contract.value?.blocks) && contract.value.blocks.length > 0);

const hideFooter = computed(() => shouldHideEarnestFooter({
	whitelabel: contract.value?.organization?.whitelabel,
	plan: contract.value?.organization?.plan,
}));

const coverContext = computed(() => {
	const o: any = contract.value?.organization;
	const logo = o?.logo;
	const logoId = typeof logo === 'string' ? logo : logo?.id;
	return {
		logoUrl: logoId ? `${config.public.directusUrl}/assets/${logoId}?key=medium-contain` : null,
		title: contract.value?.title || null,
		recipient: recipient.value?.name || null,
		dateSent: contract.value?.date_sent || null,
		dateLabel: 'Sent',
		expiresAt: contract.value?.effective_date || contract.value?.valid_until || null,
		expiresLabel: contract.value?.effective_date ? 'Effective' : 'Valid until',
	};
});

function formatTotal(n: number | null | undefined) {
	if (n == null) return null;
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

// Signing form
const signerName = ref('');
const signerEmail = ref('');
const affirm = ref(false);
const signing = ref(false);
const signError = ref<string | null>(null);
const justSigned = ref(false);

const canSubmit = computed(() => !!signerName.value.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signerEmail.value) && affirm.value && !signing.value);

async function submitSignature() {
	if (!canSubmit.value) return;
	signing.value = true;
	signError.value = null;
	try {
		await $fetch('/api/contracts/sign', {
			method: 'POST',
			body: {
				token: token.value,
				name: signerName.value.trim(),
				email: signerEmail.value.trim(),
				signature_data: signerName.value.trim(),
				affirm: affirm.value,
			},
		});
		justSigned.value = true;
		await load();
	} catch (err: any) {
		signError.value = err?.data?.message || err?.message || 'Failed to sign';
	} finally {
		signing.value = false;
	}
}

const isSigned = computed(() => contract.value?.contract_status === 'signed');
const isSignable = computed(() => contract.value?.contract_status === 'sent');
</script>

<template>
	<div class="w-full flex flex-col items-center justify-start min-h-screen bg-gray-50 dark:bg-gray-900">
		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>
		<div v-else-if="errorMsg" class="py-20 text-sm text-muted-foreground text-center">
			<UIcon name="lucide:file-x" class="w-12 h-12 mx-auto mb-3 opacity-50" />
			<p>{{ errorMsg }}</p>
		</div>
		<div v-else-if="contract" class="w-full flex flex-col items-center justify-center z-10 page__inner py-8">
			<div class="px-6 pt-12 pb-16 w-full max-w-3xl border bg-white dark:bg-gray-800 shadow proposal">
				<DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta" />

				<div v-if="contract.total_value != null" class="mt-6 mb-2 flex items-center justify-between border-t border-gray-200 dark:border-gray-600 pt-4">
					<p class="text-[10px] uppercase tracking-wider opacity-60">Total value</p>
					<p class="text-xl font-bold">{{ formatTotal(contract.total_value) }}</p>
				</div>

				<div v-if="hasBlocks" class="mt-8">
					<DocumentsBlockRenderer :blocks="contract.blocks" :cover="coverContext" />
				</div>
				<div v-else class="mt-12 text-center opacity-50 text-sm">
					This contract has no content yet.
				</div>

				<!-- Signature block -->
				<div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
					<div v-if="isSigned">
						<p class="text-[10px] uppercase tracking-wider text-green-700 dark:text-green-400">Signed</p>
						<p class="text-base font-medium mt-1" style="font-family: 'Caveat', cursive;">
							{{ contract.signed_by_name }}
						</p>
						<p class="text-xs text-muted-foreground mt-0.5">
							{{ contract.signed_by_email }} · {{ contract.signed_at ? new Date(contract.signed_at).toLocaleString() : '' }}
						</p>
						<div v-if="justSigned" class="mt-3 rounded-md bg-green-50 dark:bg-green-900/20 px-3 py-2 text-xs text-green-700 dark:text-green-300">
							Thanks for signing! A copy will be on its way.
						</div>
					</div>

					<div v-else-if="isSignable" class="space-y-3">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Sign this contract</p>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
							<div>
								<label class="block text-xs text-muted-foreground mb-1">Full name</label>
								<UInput v-model="signerName" placeholder="Your full name" :disabled="signing" />
							</div>
							<div>
								<label class="block text-xs text-muted-foreground mb-1">Email</label>
								<UInput v-model="signerEmail" type="email" placeholder="you@example.com" :disabled="signing" />
							</div>
						</div>

						<div v-if="signerName" class="ios-card p-4 bg-gray-50 dark:bg-gray-900/40">
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Signature preview</p>
							<p class="text-2xl mt-1" style="font-family: 'Caveat', 'Brush Script MT', cursive;">
								{{ signerName }}
							</p>
						</div>

						<label class="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
							<input v-model="affirm" type="checkbox" class="mt-0.5" :disabled="signing" />
							<span>
								By checking this box and clicking <strong>Sign Contract</strong>, I affirm that typing my name above constitutes my legal signature on this agreement and I agree to its terms.
							</span>
						</label>

						<div v-if="signError" class="text-xs text-red-600 dark:text-red-400">{{ signError }}</div>

						<button
							class="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
							:disabled="!canSubmit"
							@click="submitSignature"
						>
							<UIcon
								:name="signing ? 'lucide:loader-2' : 'lucide:pen-line'"
								class="w-4 h-4"
								:class="signing ? 'animate-spin' : ''"
							/>
							Sign Contract
						</button>
					</div>

					<div v-else class="text-sm text-muted-foreground">
						This contract is currently {{ contract.contract_status }} and can't be signed.
					</div>
				</div>

				<DocumentsDocumentFooter :hidden="hideFooter" />
			</div>
		</div>
	</div>
</template>
