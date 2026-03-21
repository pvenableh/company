<script setup>
const modelValue = defineModel({ type: Boolean, default: false });

const props = defineProps({
	goal: { type: Object, default: null },
});

const emit = defineEmits(['saved']);

const { user } = useDirectusAuth();
const isEditing = computed(() => !!props.goal);

const form = ref({
	title: '',
	description: '',
	type: 'financial',
	target_value: null,
	target_unit: 'USD',
	current_value: 0,
	start_date: '',
	end_date: '',
	timeframe: 'quarterly',
	priority: 'medium',
	status: 'active',
});

const saving = ref(false);

const typeOptions = [
	{ label: 'Financial', value: 'financial', icon: 'i-heroicons-banknotes' },
	{ label: 'Networking', value: 'networking', icon: 'i-heroicons-user-group' },
	{ label: 'Performance', value: 'performance', icon: 'i-heroicons-chart-bar' },
	{ label: 'Marketing', value: 'marketing', icon: 'i-heroicons-megaphone' },
	{ label: 'Custom', value: 'custom', icon: 'i-heroicons-flag' },
];

const timeframeOptions = [
	{ label: 'Weekly', value: 'weekly' },
	{ label: 'Monthly', value: 'monthly' },
	{ label: 'Quarterly', value: 'quarterly' },
	{ label: 'Yearly', value: 'yearly' },
	{ label: 'Custom', value: 'custom' },
];

const priorityOptions = [
	{ label: 'Low', value: 'low' },
	{ label: 'Medium', value: 'medium' },
	{ label: 'High', value: 'high' },
];

const unitOptions = [
	{ label: 'USD ($)', value: 'USD' },
	{ label: 'Percent (%)', value: 'percent' },
	{ label: 'Contacts', value: 'contacts' },
	{ label: 'Projects', value: 'projects' },
	{ label: 'Tasks', value: 'tasks' },
	{ label: 'Campaigns', value: 'campaigns' },
	{ label: 'Custom', value: '' },
];

// Populate form when editing
watch(modelValue, (open) => {
	if (open && props.goal) {
		form.value = {
			title: props.goal.title || '',
			description: props.goal.description || '',
			type: props.goal.type || 'financial',
			target_value: props.goal.target_value,
			target_unit: props.goal.target_unit || 'USD',
			current_value: props.goal.current_value || 0,
			start_date: props.goal.start_date || '',
			end_date: props.goal.end_date || '',
			timeframe: props.goal.timeframe || 'quarterly',
			priority: props.goal.priority || 'medium',
			status: props.goal.status || 'active',
		};
	} else if (open) {
		form.value = {
			title: '',
			description: '',
			type: 'financial',
			target_value: null,
			target_unit: 'USD',
			current_value: 0,
			start_date: new Date().toISOString().split('T')[0],
			end_date: '',
			timeframe: 'quarterly',
			priority: 'medium',
			status: 'active',
		};
	}
});

const handleSave = async () => {
	if (!form.value.title.trim()) return;
	saving.value = true;
	try {
		emit('saved', {
			...form.value,
			id: props.goal?.id,
		});
	} finally {
		saving.value = false;
	}
};
</script>

<template>
	<UModal v-model="modelValue">
		<div class="space-y-5 p-1">
			<div>
				<h2 class="text-lg font-semibold text-foreground">{{ isEditing ? 'Edit Goal' : 'New Goal' }}</h2>
				<p class="text-sm text-muted-foreground mt-0.5">Set a target to track your progress</p>
			</div>

			<!-- Type selector -->
			<div>
				<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Type</label>
				<div class="flex gap-2 flex-wrap">
					<button
						v-for="opt in typeOptions"
						:key="opt.value"
						@click="form.type = opt.value"
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
						:class="form.type === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
					>
						<UIcon :name="opt.icon" class="w-3.5 h-3.5" />
						{{ opt.label }}
					</button>
				</div>
			</div>

			<!-- Title -->
			<div>
				<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Title</label>
				<input
					v-model="form.title"
					type="text"
					placeholder="e.g., Reach $50K monthly revenue"
					class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
				/>
			</div>

			<!-- Description -->
			<div>
				<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
				<textarea
					v-model="form.description"
					rows="2"
					placeholder="What does success look like?"
					class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
				/>
			</div>

			<!-- Target & Unit -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Target</label>
					<input
						v-model.number="form.target_value"
						type="number"
						placeholder="50000"
						class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
					/>
				</div>
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Unit</label>
					<select
						v-model="form.target_unit"
						class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
					>
						<option v-for="opt in unitOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
					</select>
				</div>
			</div>

			<!-- Current Value (for editing) -->
			<div v-if="isEditing">
				<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Current Value</label>
				<input
					v-model.number="form.current_value"
					type="number"
					class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
				/>
			</div>

			<!-- Timeframe & Priority -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Timeframe</label>
					<select
						v-model="form.timeframe"
						class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
					>
						<option v-for="opt in timeframeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
					</select>
				</div>
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Priority</label>
					<select
						v-model="form.priority"
						class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
					>
						<option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
					</select>
				</div>
			</div>

			<!-- Dates -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Start Date</label>
					<input
						v-model="form.start_date"
						type="date"
						class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
					/>
				</div>
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">End Date</label>
					<input
						v-model="form.end_date"
						type="date"
						class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
					/>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex justify-end gap-2 pt-2">
				<button
					@click="modelValue = false"
					class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg"
				>
					Cancel
				</button>
				<button
					@click="handleSave"
					:disabled="!form.title.trim() || saving"
					class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
				>
					{{ saving ? 'Saving...' : isEditing ? 'Update Goal' : 'Create Goal' }}
				</button>
			</div>
		</div>
	</UModal>
</template>
