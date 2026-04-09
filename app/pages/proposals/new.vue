<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'New Proposal | Earnest' });

const route = useRoute();
const { createProposal } = useProposals();
const saving = ref(false);

// Pre-fill from lead if provided
const leadId = computed(() => route.query.lead as string | undefined);

async function handleSubmit(data: any) {
	saving.value = true;
	try {
		const result = await createProposal({
			...data,
			lead: data.lead || (leadId.value ? Number(leadId.value) : null),
		});
		await navigateTo(`/proposals/${(result as any).id}`);
	} catch (e) {
		console.error('Failed to create proposal:', e);
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<div class="page__inner px-6 max-w-2xl mx-auto">
		<div class="mb-6">
			<NuxtLink to="/proposals" class="text-xs t-text-muted hover:t-text-secondary flex items-center gap-1 mb-3">
				<UIcon name="i-heroicons-arrow-left" class="w-3 h-3" /> Back to proposals
			</NuxtLink>
			<h1 class="text-xl font-bold t-text">New Proposal</h1>
		</div>

		<div class="ios-card p-6">
			<ProposalsProposalForm
				:lead-id="leadId"
				:saving="saving"
				@submit="handleSubmit"
				@cancel="navigateTo('/proposals')"
			/>
		</div>
	</div>
</template>
