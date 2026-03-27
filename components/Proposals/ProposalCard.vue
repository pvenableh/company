<template>
	<div class="ios-card p-4 cursor-pointer hover:shadow-md transition-all" @click="$emit('click', proposal)">
		<div class="flex items-start justify-between mb-2">
			<div>
				<p class="text-sm font-medium t-text">{{ proposal.title || 'Untitled Proposal' }}</p>
				<p class="text-xs t-text-secondary">
					{{ proposal.organization?.name || proposal.contact?.first_name + ' ' + proposal.contact?.last_name }}
				</p>
			</div>
			<span
				v-if="proposal.proposal_status"
				class="text-[10px] font-semibold px-2 py-0.5 rounded-full"
				:style="{ color: statusColor, backgroundColor: statusColor + '15' }"
			>
				{{ statusLabel }}
			</span>
		</div>

		<div class="flex items-center justify-between mt-3">
			<span v-if="proposal.total_value" class="text-sm font-medium t-text">
				${{ Number(proposal.total_value).toLocaleString() }}
			</span>
			<span v-if="proposal.valid_until" class="text-[10px] t-text-muted">
				Expires {{ new Date(proposal.valid_until).toLocaleDateString() }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from '~/types/proposals-enhanced';

const props = defineProps<{ proposal: any }>();
defineEmits<{ click: [proposal: any] }>();

const statusLabel = computed(() => PROPOSAL_STATUS_LABELS[props.proposal.proposal_status as keyof typeof PROPOSAL_STATUS_LABELS] || props.proposal.proposal_status);
const statusColor = computed(() => PROPOSAL_STATUS_COLORS[props.proposal.proposal_status as keyof typeof PROPOSAL_STATUS_COLORS] || '#6B7280');
</script>
