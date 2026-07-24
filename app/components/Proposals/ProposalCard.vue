<template>
	<div class="ios-card p-4 cursor-pointer hover:shadow-md transition-all" @click="$emit('click', proposal)">
		<div class="flex items-start justify-between mb-2">
			<div>
				<p class="text-sm font-medium text-foreground">{{ proposal.title || 'Untitled Proposal' }}</p>
				<p class="text-xs text-muted-foreground">
					{{ proposal.organization?.name || proposal.contact?.first_name + ' ' + proposal.contact?.last_name }}
				</p>
			</div>
			<span
				v-if="proposal.proposal_status"
				class="text-[10px] font-semibold px-2 py-0.5 rounded-full"
				:class="getStatusBadgeClasses(proposal.proposal_status)"
			>
				{{ statusLabel }}
			</span>
		</div>

		<div class="flex items-center justify-between mt-3">
			<span v-if="proposal.total_value" class="text-sm font-medium text-foreground">
				${{ Number(proposal.total_value).toLocaleString() }}
			</span>
			<span v-if="proposal.valid_until" class="text-[10px] text-muted-foreground/40">
				Expires {{ new Date(proposal.valid_until).toLocaleDateString() }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';

const props = defineProps<{ proposal: any }>();
defineEmits<{ click: [proposal: any] }>();

// Status color routes through the canonical palette-driven buckets.
const { getStatusBadgeClasses } = useStatusStyle();
const statusLabel = computed(() => PROPOSAL_STATUS_LABELS[props.proposal.proposal_status as keyof typeof PROPOSAL_STATUS_LABELS] || props.proposal.proposal_status);
</script>
