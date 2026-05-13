<script setup lang="ts">
import { shouldHideEarnestFooter } from '~~/shared/branding';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Proposal | Client Portal' });

const route = useRoute();
const proposalItems = usePortalItems('proposals');

// Archive unread bell rows for this proposal on mount.
useMarkItemRead('proposals', () => route.params.id as string);

const proposal = ref<any>(null);
const loading = ref(true);
const notFound = ref(false);

onMounted(async () => {
	try {
		proposal.value = await proposalItems.get(route.params.id as string, {
			fields: [
				'id', 'title', 'date_sent', 'valid_until', 'total_value', 'proposal_status', 'notes', 'blocks',
				'organization.id', 'organization.name', 'organization.logo',
				'organization.address', 'organization.phone', 'organization.email', 'organization.website',
				'organization.plan', 'organization.whitelabel',
				'organization.document_theme', 'organization.document_accent',
				'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company',
			],
		});
	} catch (err: any) {
		if (err?.statusCode === 404) notFound.value = true;
		else console.error('Failed to load proposal:', err);
	} finally {
		loading.value = false;
	}
});

const config = useRuntimeConfig();

const hideFooter = computed(() => shouldHideEarnestFooter({
	whitelabel: proposal.value?.organization?.whitelabel,
	plan: proposal.value?.organization?.plan,
}));

const seller = computed(() => {
	const o: any = proposal.value?.organization;
	if (!o) return null;
	return {
		name: o.name,
		logo: o.logo,
		address: o.address,
		phone: o.phone,
		email: o.email,
		website: o.website,
	};
});

const recipient = computed(() => {
	const c: any = proposal.value?.contact;
	if (!c) return null;
	const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
	return {
		name: c.company || name || null,
		address: null,
		emails: c.email ? [c.email] : null,
	};
});

const coverContext = computed(() => {
	const o: any = proposal.value?.organization;
	const logo = o?.logo;
	const logoId = typeof logo === 'string' ? logo : logo?.id;
	return {
		logoUrl: logoId ? `${config.public.directusUrl}/assets/${logoId}?key=medium-contain` : null,
		title: proposal.value?.title || null,
		recipient: recipient.value?.name || null,
		dateSent: proposal.value?.date_sent || proposal.value?.date_created || null,
		dateLabel: 'Sent',
		expiresAt: proposal.value?.valid_until || null,
		expiresLabel: 'Valid until',
	};
});

const docMeta = computed(() => ({
	kind: 'PROPOSAL',
	code: proposal.value?.id ? `P-${proposal.value.id.slice(0, 8)}` : null,
	date: proposal.value?.date_sent || proposal.value?.date_created,
	dateLabel: 'Sent',
	expiresAt: proposal.value?.valid_until,
	expiresLabel: 'Valid until',
	status: proposal.value?.proposal_status,
}));

const hasBlocks = computed(() => Array.isArray(proposal.value?.blocks) && proposal.value.blocks.length > 0);

function formatTotal(n: number | null | undefined) {
	if (n == null) return null;
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}
</script>

<template>
	<div class="portal-page">
		<AppHeader
			:title="proposal?.title || 'Proposal'"
			show-back
			back-label="Proposals"
		/>

		<LayoutPageContainer>
		<div v-if="loading" class="flex items-center justify-center py-20">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
		</div>

		<div v-else-if="notFound || !proposal" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:file-x" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">Proposal not found.</p>
		</div>

		<div v-else class="w-full flex flex-col items-center justify-center relative z-10">
			<DocumentsDocumentShell
				:seller="proposal.organization"
				wrapper-class="px-6 pt-12 pb-16 w-full max-w-3xl proposal proposal-doc"
			>
				<DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta">
					<template #actions>
						<ClientOnly>
							<DocumentsDocumentPdfGenerator
								:filename="(proposal.title || 'proposal').replace(/\\s+/g, '-')"
								selector=".doc-shell.proposal-doc"
								data-pdf-strip
							/>
						</ClientOnly>
					</template>
				</DocumentsDocumentHeader>

				<div v-if="proposal.total_value != null" class="mt-6 mb-2 flex items-center justify-between pt-4 doc__total-rule" style="border-top: 1px solid var(--doc-rule);">
					<p class="text-[10px] uppercase tracking-wider opacity-60">Total investment</p>
					<p class="text-xl font-bold">{{ formatTotal(proposal.total_value) }}</p>
				</div>

				<div v-if="hasBlocks" class="mt-8">
					<DocumentsBlockRenderer :blocks="proposal.blocks" :cover="coverContext" />
				</div>

				<div v-else-if="proposal.notes" class="mt-8 prose prose-sm dark:prose-invert max-w-none" v-html="proposal.notes" />

				<div v-else class="mt-12 text-center opacity-50 text-sm">
					This proposal has no content yet.
				</div>

				<DocumentsDocumentFooter :hidden="hideFooter" />
			</DocumentsDocumentShell>

			<NuxtLink
				v-if="['sent', 'viewed'].includes(proposal.proposal_status)"
				to="/portal/proposals"
				class="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 transition-colors px-4 py-2 rounded-full"
				data-pdf-strip
			>
				<Icon name="lucide:arrow-left" class="w-3.5 h-3.5" />
				Accept or decline on the list
			</NuxtLink>
		</div>
		</LayoutPageContainer>
	</div>
</template>
