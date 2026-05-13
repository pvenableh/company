<script setup lang="ts">
import { shouldHideEarnestFooter } from '~~/shared/branding';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Contract | Client Portal' });

const route = useRoute();
const contractItems = usePortalItems('contracts');

const contract = ref<any>(null);
const loading = ref(true);
const notFound = ref(false);

onMounted(async () => {
	try {
		contract.value = await contractItems.get(route.params.id as string, {
			fields: [
				'id', 'title', 'date_sent', 'valid_until', 'effective_date', 'total_value', 'contract_status', 'notes', 'blocks',
				'signed_at', 'signed_by_name', 'signed_by_email',
				'organization.id', 'organization.name', 'organization.logo',
				'organization.address', 'organization.phone', 'organization.email', 'organization.website',
				'organization.plan', 'organization.whitelabel',
				'organization.document_theme', 'organization.document_accent',
				'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company',
			],
		});
	} catch (err: any) {
		if (err?.statusCode === 404) notFound.value = true;
		else console.error('Failed to load contract:', err);
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
	<div class="portal-page">
		<AppHeader
			:title="contract?.title || 'Contract'"
			show-back
			back-label="Contracts"
		/>

		<LayoutPageContainer>
		<div v-if="loading" class="flex items-center justify-center py-20">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
		</div>

		<div v-else-if="notFound || !contract" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:file-x" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">Contract not found.</p>
		</div>

		<div v-else class="w-full flex flex-col items-center justify-center relative z-10">
			<DocumentsDocumentShell
				:seller="contract.organization"
				wrapper-class="px-6 pt-12 pb-16 w-full max-w-3xl proposal contract-doc"
			>
				<DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta">
					<template #actions>
						<ClientOnly>
							<DocumentsDocumentPdfGenerator
								:filename="(contract.title || 'contract').replace(/\\s+/g, '-')"
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
					This contract has no content yet.
				</div>

				<div
					v-if="contract.contract_status === 'signed'"
					class="mt-8 pt-6"
					style="border-top: 1px solid var(--doc-rule);"
				>
					<p class="text-[10px] uppercase tracking-wider opacity-60">Signed</p>
					<p class="text-sm font-medium mt-0.5">
						{{ contract.signed_by_name }} <span class="opacity-60 text-xs">&lt;{{ contract.signed_by_email }}&gt;</span>
					</p>
					<p class="text-xs opacity-60">{{ contract.signed_at ? new Date(contract.signed_at).toLocaleString() : '' }}</p>
				</div>

				<DocumentsDocumentFooter :hidden="hideFooter" />
			</DocumentsDocumentShell>

			<NuxtLink
				v-if="contract.contract_status === 'sent'"
				to="/portal/contracts"
				class="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 transition-colors px-4 py-2 rounded-full"
				data-pdf-strip
			>
				<Icon name="lucide:pen-tool" class="w-3.5 h-3.5" />
				Sign this contract
			</NuxtLink>
		</div>
		</LayoutPageContainer>
	</div>
</template>
