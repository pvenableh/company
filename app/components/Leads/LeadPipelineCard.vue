<template>
	<div
		class="ios-card p-3 cursor-pointer hover:shadow-md transition-all group"
		@click="$emit('edit', lead)"
	>
		<!-- Header: Priority + Overdue indicator -->
		<div class="flex items-center justify-between mb-1.5">
			<span
				v-if="lead.priority"
				class="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
				:class="priorityClass"
			>
				{{ lead.priority }}
			</span>
			<div v-if="isOverdue" class="flex items-center gap-1 text-red-500">
				<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
				<span class="text-[9px] font-medium">Overdue</span>
			</div>
		</div>

		<!-- Contact name -->
		<p class="text-sm font-medium t-text truncate">
			{{ lead.related_contact?.first_name }} {{ lead.related_contact?.last_name }}
		</p>
		<p class="text-[11px] t-text-secondary truncate mb-2">
			{{ lead.related_contact?.company || lead.related_contact?.email || '' }}
		</p>

		<!-- Tags -->
		<div v-if="lead.tags?.length" class="flex flex-wrap gap-1 mb-2">
			<span
				v-for="tag in lead.tags.slice(0, 3)"
				:key="tag"
				class="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-foreground"
			>
				{{ tag }}
			</span>
			<span v-if="lead.tags.length > 3" class="text-[9px] text-muted-foreground">
				+{{ lead.tags.length - 3 }}
			</span>
		</div>

		<!-- Score bar -->
		<div class="flex items-center gap-2 mb-2">
			<div class="flex-1 h-1 bg-muted rounded-full overflow-hidden">
				<div
					class="h-full rounded-full transition-all"
					:style="{ width: `${lead.lead_score || 0}%`, backgroundColor: scoreColor }"
				/>
			</div>
			<span class="text-[9px] font-mono t-text-muted tabular-nums">{{ lead.lead_score || 0 }}</span>
		</div>

		<!-- Footer: Value + Avatar -->
		<div class="flex items-center justify-between">
			<span v-if="lead.estimated_value" class="text-xs font-medium t-text">
				${{ Number(lead.estimated_value).toLocaleString() }}
			</span>
			<span v-else class="text-[10px] t-text-muted">No value</span>

			<UAvatar
				v-if="lead.assigned_to?.avatar"
				:src="`${useRuntimeConfig().public.directusUrl}/assets/${lead.assigned_to.avatar}?key=small`"
				size="2xs"
			/>
			<div
				v-else-if="lead.assigned_to?.first_name"
				class="size-5 rounded-full bg-muted flex items-center justify-center"
			>
				<span class="text-[8px] font-semibold text-muted-foreground">
					{{ (lead.assigned_to.first_name?.[0] || '') + (lead.assigned_to.last_name?.[0] || '') }}
				</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{ lead: any }>();
defineEmits<{ edit: [lead: any] }>();

const isOverdue = computed(() => {
	if (!props.lead.next_follow_up) return false;
	return new Date(props.lead.next_follow_up) < new Date();
});

const scoreColor = computed(() => {
	const score = props.lead.lead_score || 0;
	if (score >= 70) return '#10B981';
	if (score >= 40) return '#F59E0B';
	return '#EF4444';
});

const { getPriorityBadgeClasses } = useStatusStyle();
const priorityClass = computed(() => getPriorityBadgeClasses(props.lead.priority));
</script>
