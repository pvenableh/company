<template>
	<div class="ios-card p-4 cursor-pointer hover:shadow-md transition-all" @click="$emit('click', lead)">
		<div class="flex items-start justify-between mb-2">
			<div class="flex items-center gap-2">
				<UAvatar
					v-if="lead.assigned_to?.avatar"
					:src="`${useRuntimeConfig().public.directusUrl}/assets/${lead.assigned_to.avatar}`"
					size="xs"
				/>
				<div>
					<p class="text-sm font-medium t-text">
						{{ lead.related_contact?.first_name }} {{ lead.related_contact?.last_name }}
					</p>
					<p class="text-xs t-text-secondary">
						{{ lead.related_contact?.company || lead.related_contact?.email }}
					</p>
				</div>
			</div>
			<span
				v-if="lead.stage"
				class="text-[10px] font-semibold px-2 py-0.5 rounded-full"
				:style="{ color: stageColor, backgroundColor: stageColor + '15' }"
			>
				{{ stageLabel }}
			</span>
		</div>

		<!-- Score bar -->
		<div class="flex items-center gap-2 mb-2">
			<div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
				<div
					class="h-full rounded-full transition-all"
					:style="{ width: `${lead.lead_score || 0}%`, backgroundColor: scoreColor }"
				/>
			</div>
			<span class="text-[10px] font-mono t-text-muted">{{ lead.lead_score || 0 }}</span>
		</div>

		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span
					v-if="lead.priority"
					class="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
					:class="priorityClass"
				>
					{{ lead.priority }}
				</span>
				<span v-if="lead.source" class="text-[10px] t-text-muted">{{ lead.source }}</span>
			</div>
			<span v-if="lead.estimated_value" class="text-xs font-medium t-text">
				${{ Number(lead.estimated_value).toLocaleString() }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { LEAD_STAGE_LABELS, LEAD_STAGE_COLORS } from '~~/shared/leads';

const props = defineProps<{ lead: any }>();
defineEmits<{ click: [lead: any] }>();

const stageLabel = computed(() => LEAD_STAGE_LABELS[props.lead.stage as keyof typeof LEAD_STAGE_LABELS] || props.lead.stage);
const stageColor = computed(() => LEAD_STAGE_COLORS[props.lead.stage as keyof typeof LEAD_STAGE_COLORS] || '#6B7280');

const scoreColor = computed(() => {
	const score = props.lead.lead_score || 0;
	if (score >= 70) return '#10B981';
	if (score >= 40) return '#F59E0B';
	return '#EF4444';
});

const priorityClass = computed(() => {
	const p = props.lead.priority;
	if (p === 'high' || p === 'urgent') return 'bg-red-500/15 text-red-400';
	if (p === 'medium') return 'bg-yellow-500/15 text-yellow-400';
	return 'bg-gray-500/15 text-gray-400';
});
</script>
