<script setup lang="ts">
import { shouldHideEarnestFooter } from '~~/shared/branding';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Contract Preview | Earnest' });

const { params } = useRoute();
const contractItems = useDirectusItems('contracts');

const contract = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
	try {
		contract.value = await contractItems.get(params.id as string, {
			fields: [
				'id', 'title', 'date_sent', 'valid_until', 'effective_date', 'total_value', 'contract_status', 'notes', 'blocks',
				'signing_token', 'signed_at', 'signed_by_name', 'signed_by_email',
				'organization.id', 'organization.name', 'organization.logo',
				'organization.address', 'organization.phone', 'organization.email', 'organization.website',
				'organization.plan', 'organization.whitelabel',
				'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company',
			],
		});
	} finally {
		loading.value = false;
	}
});

const config = useRuntimeConfig();

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
	date: contract.value?.date_sent || contract.value?.date_created,
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
		dateSent: contract.value?.date_sent || contract.value?.date_created || null,
		dateLabel: 'Sent',
		expiresAt: contract.value?.effective_date || contract.value?.valid_until || null,
		expiresLabel: contract.value?.effective_date ? 'Effective' : 'Valid until',
	};
});

function formatTotal(n: number | null | undefined) {
	if (n == null) return null;
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}
</script>

<template>
	<div class="w-full flex flex-col items-center justify-start">
		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>
		<div v-else-if="!contract" class="py-20 text-sm text-muted-foreground">Contract not found.</div>
		<div v-else class="w-full flex flex-col items-center justify-center z-10 page__inner">
			<div class="px-6 pt-12 pb-16 w-full max-w-3xl border bg-white/90 dark:bg-gray-700 shadow proposal">
				<DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta">
					<template #actions>
						<button v-if="contract.title" class="hidden md:block text-[10px] uppercase tracking-wider opacity-60">
							{{ contract.title }}
						</button>
					</template>
				</DocumentsDocumentHeader>

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

				<!-- Signed-already badge -->
				<div
					v-if="contract.contract_status === 'signed'"
					class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600"
				>
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Signed</p>
					<p class="text-sm font-medium mt-0.5">
						{{ contract.signed_by_name }} <span class="text-muted-foreground text-xs">&lt;{{ contract.signed_by_email }}&gt;</span>
					</p>
					<p class="text-xs text-muted-foreground">{{ contract.signed_at ? new Date(contract.signed_at).toLocaleString() : '' }}</p>
				</div>

				<DocumentsDocumentFooter :hidden="hideFooter" />
			</div>
		</div>
	</div>
</template>
