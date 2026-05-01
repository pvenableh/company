<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Proposal Preview | Earnest' });

const { params } = useRoute();
const proposalItems = useDirectusItems('proposals');

const proposal = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
	try {
		proposal.value = await proposalItems.get(params.id as string, {
			fields: [
				'id', 'title', 'date_sent', 'valid_until', 'total_value', 'proposal_status', 'notes', 'blocks',
				'organization.id', 'organization.name', 'organization.logo',
				'organization.address', 'organization.phone', 'organization.email', 'organization.website',
				'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company',
			],
		});
	} finally {
		loading.value = false;
	}
});

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
	<div class="w-full flex flex-col items-center justify-start">
		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>
		<div v-else-if="!proposal" class="py-20 text-sm text-muted-foreground">Proposal not found.</div>
		<div v-else class="w-full flex flex-col items-center justify-center z-10 page__inner">
			<div class="px-6 pt-12 pb-16 w-full max-w-3xl border bg-white/90 dark:bg-gray-700 shadow proposal">
				<DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta">
					<template #actions>
						<button
							v-if="proposal.title"
							class="hidden md:block text-[10px] uppercase tracking-wider opacity-60"
						>
							{{ proposal.title }}
						</button>
					</template>
				</DocumentsDocumentHeader>

				<!-- Total -->
				<div v-if="proposal.total_value != null" class="mt-6 mb-2 flex items-center justify-between border-t border-gray-200 dark:border-gray-600 pt-4">
					<p class="text-[10px] uppercase tracking-wider opacity-60">Total investment</p>
					<p class="text-xl font-bold">{{ formatTotal(proposal.total_value) }}</p>
				</div>

				<!-- Blocks -->
				<div v-if="hasBlocks" class="mt-8">
					<DocumentsBlockRenderer :blocks="proposal.blocks" />
				</div>

				<!-- Legacy notes fallback -->
				<div v-else-if="proposal.notes" class="mt-8 prose prose-sm dark:prose-invert max-w-none" v-html="proposal.notes" />

				<div v-else class="mt-12 text-center opacity-50 text-sm">
					This proposal has no content yet.
				</div>

				<DocumentsDocumentFooter />
			</div>
		</div>
	</div>
</template>
