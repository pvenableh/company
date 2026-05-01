<template>
	<div class="ios-card p-4 cursor-pointer hover:shadow-md transition-all" @click="$emit('click', contract)">
		<div class="flex items-start justify-between mb-2">
			<div>
				<p class="text-sm font-medium t-text">{{ contract.title || 'Untitled Contract' }}</p>
				<p class="text-xs t-text-secondary">
					{{ contract.organization?.name || (contract.contact?.first_name + ' ' + contract.contact?.last_name) }}
				</p>
			</div>
			<span
				v-if="contract.contract_status"
				class="text-[10px] font-semibold px-2 py-0.5 rounded-full"
				:style="{ color: statusColor, backgroundColor: statusColor + '15' }"
			>
				{{ statusLabel }}
			</span>
		</div>

		<div class="flex items-center justify-between mt-3">
			<span v-if="contract.total_value" class="text-sm font-medium t-text">
				${{ Number(contract.total_value).toLocaleString() }}
			</span>
			<span v-if="contract.signed_at" class="text-[10px] t-text-muted">
				Signed {{ new Date(contract.signed_at).toLocaleDateString() }}
			</span>
			<span v-else-if="contract.valid_until" class="text-[10px] t-text-muted">
				Valid until {{ new Date(contract.valid_until).toLocaleDateString() }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from '~~/shared/contracts';

const props = defineProps<{ contract: any }>();
defineEmits<{ click: [contract: any] }>();

const statusLabel = computed(() => CONTRACT_STATUS_LABELS[props.contract.contract_status as keyof typeof CONTRACT_STATUS_LABELS] || props.contract.contract_status);
const statusColor = computed(() => CONTRACT_STATUS_COLORS[props.contract.contract_status as keyof typeof CONTRACT_STATUS_COLORS] || '#6B7280');
</script>
