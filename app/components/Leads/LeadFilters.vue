<template>
	<div class="flex flex-wrap items-center gap-2">
		<EInput
			v-model="search"
			icon="i-heroicons-magnifying-glass"
			placeholder="Search leads..."
			size="sm"
			class="w-48"
			@update:model-value="$emit('update:search', $event)"
		/>
		<ESelectMenu
			v-model="stage"
			:options="stageOptions"
			value-attribute="value"
			option-attribute="label"
			placeholder="Stage"
			size="sm"
			class="w-36"
			@update:model-value="$emit('update:stage', $event)"
		/>
		<ESelectMenu
			v-model="priority"
			:options="priorityOptions"
			value-attribute="value"
			option-attribute="label"
			placeholder="Priority"
			size="sm"
			class="w-32"
			@update:model-value="$emit('update:priority', $event)"
		/>
		<EButton
			v-if="hasActiveFilters"
			variant="ghost"
			size="xs"
			icon="i-heroicons-x-mark"
			@click="clearFilters"
		>
			Clear
		</EButton>
	</div>
</template>

<script setup lang="ts">
const search = defineModel<string>('search', { default: '' });
const stage = defineModel<string>('stage', { default: '' });
const priority = defineModel<string>('priority', { default: '' });

const emit = defineEmits(['update:search', 'update:stage', 'update:priority', 'clear']);

const stageOptions = [
	{ value: '', label: 'All Stages' },
	{ value: 'new', label: 'New' },
	{ value: 'contacted', label: 'Contacted' },
	{ value: 'qualified', label: 'Qualified' },
	{ value: 'proposal_sent', label: 'Proposal Sent' },
	{ value: 'negotiating', label: 'Negotiating' },
	{ value: 'won', label: 'Won' },
	{ value: 'lost', label: 'Lost' },
];

const priorityOptions = [
	{ value: '', label: 'All Priorities' },
	{ value: 'urgent', label: 'Urgent' },
	{ value: 'high', label: 'High' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'low', label: 'Low' },
];

const hasActiveFilters = computed(() => search.value || stage.value || priority.value);

function clearFilters() {
	search.value = '';
	stage.value = '';
	priority.value = '';
	emit('clear');
}
</script>
