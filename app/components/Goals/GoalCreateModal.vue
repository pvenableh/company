<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Goal' : 'New Goal'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!form.title.trim()"
		collection="goals"
		:item-id="goal?.id ?? null"
		@submit="handleSubmit"
		@delete="handleDelete"
	>
		<!-- Title -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Title</label>
			<UInput v-model="form.title" placeholder="e.g., Reach $50K monthly revenue" />
		</div>

		<!-- Type (pill group) -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Type</label>
			<div class="flex gap-2 flex-wrap pt-1">
				<button
					v-for="opt in goalTypeOptions"
					:key="opt.value"
					type="button"
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
					:class="form.type === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
					@click="form.type = opt.value"
				>
					<UIcon :name="opt.icon" class="w-3.5 h-3.5" />
					{{ opt.label }}
				</button>
			</div>
		</div>

		<!-- Description -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Description</label>
			<UTextarea v-model="form.description" :rows="2" placeholder="What does success look like?" />
		</div>

		<!-- Target + Unit -->
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Target</label>
				<UInput v-model.number="form.target_value" type="number" placeholder="50000" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Unit</label>
				<select
					v-model="form.target_unit"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option v-for="opt in goalUnitOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
		</div>

		<!-- Current Value (edit-only) -->
		<div v-if="isEditing" class="space-y-1">
			<label class="t-label text-muted-foreground">Current Value</label>
			<UInput v-model.number="form.current_value" type="number" />
		</div>

		<!-- Timeframe + Priority -->
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Timeframe</label>
				<select
					v-model="form.timeframe"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option value="weekly">Weekly</option>
					<option value="monthly">Monthly</option>
					<option value="quarterly">Quarterly</option>
					<option value="yearly">Yearly</option>
					<option value="custom">Custom</option>
				</select>
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Priority</label>
				<select
					v-model="form.priority"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
				</select>
			</div>
		</div>

		<!-- Dates -->
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Start Date</label>
				<UInput v-model="form.start_date" type="date" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">End Date</label>
				<UInput v-model="form.end_date" type="date" />
			</div>
		</div>
	</FormModal>
</template>

<script setup>
const props = defineProps({
	goal: { type: Object, default: null },
	// Optional prefill for new-goal flow (e.g., adopting an AI suggestion)
	prefill: { type: Object, default: null },
});

const emit = defineEmits(['saved']);

const isOpen = defineModel({ default: false });
const isEditing = computed(() => !!props.goal?.id);
const saving = ref(false);

const toast = useToast();
const { createGoal, updateGoal, deleteGoal } = useGoals();

const goalTypeOptions = [
	{ label: 'Financial', value: 'financial', icon: 'i-heroicons-banknotes' },
	{ label: 'Networking', value: 'networking', icon: 'i-heroicons-user-group' },
	{ label: 'Performance', value: 'performance', icon: 'i-heroicons-chart-bar' },
	{ label: 'Marketing', value: 'marketing', icon: 'i-heroicons-megaphone' },
	{ label: 'Custom', value: 'custom', icon: 'i-heroicons-flag' },
];

const goalUnitOptions = [
	{ label: 'USD ($)', value: 'USD' },
	{ label: 'Percent (%)', value: 'percent' },
	{ label: 'Contacts', value: 'contacts' },
	{ label: 'Projects', value: 'projects' },
	{ label: 'Tasks', value: 'tasks' },
	{ label: 'Campaigns', value: 'campaigns' },
	{ label: 'Custom', value: '' },
];

function defaultForm() {
	return {
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

const form = ref(defaultForm());

function populateForm() {
	if (props.goal?.id) {
		const g = props.goal;
		form.value = {
			title: g.title || '',
			description: g.description || '',
			type: g.type || 'financial',
			target_value: g.target_value,
			target_unit: g.target_unit || 'USD',
			current_value: g.current_value || 0,
			start_date: g.start_date || '',
			end_date: g.end_date || '',
			timeframe: g.timeframe || 'quarterly',
			priority: g.priority || 'medium',
			status: g.status || 'active',
		};
	} else if (props.prefill) {
		form.value = { ...defaultForm(), ...props.prefill };
	} else {
		form.value = defaultForm();
	}
}

watch(isOpen, (open) => {
	if (open) populateForm();
});

async function handleSubmit() {
	if (!form.value.title.trim()) return;
	saving.value = true;
	try {
		// Coerce empty numeric/date strings to null — Postgres hygiene (same class as Pass 2/5/7 fixes)
		const payload = {
			...form.value,
			target_value: form.value.target_value === '' || form.value.target_value == null ? null : Number(form.value.target_value),
			current_value: form.value.current_value === '' || form.value.current_value == null ? 0 : Number(form.value.current_value),
			start_date: form.value.start_date || null,
			end_date: form.value.end_date || null,
		};

		if (isEditing.value) {
			await updateGoal(props.goal.id, payload);
			toast.add({ title: 'Goal updated', color: 'success' });
		} else {
			await createGoal(payload);
			toast.add({ title: 'Goal created', color: 'success' });
		}
		emit('saved');
		isOpen.value = false;
	} catch (err) {
		console.error('Error saving goal:', err);
		toast.add({ title: 'Error', description: 'Failed to save goal', color: 'error' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.goal?.id) return;
	if (!confirm(`Delete goal "${props.goal.title}"? This cannot be undone.`)) return;

	saving.value = true;
	try {
		await deleteGoal(props.goal.id);
		toast.add({ title: 'Goal deleted', color: 'neutral' });
		emit('saved');
		isOpen.value = false;
	} catch (err) {
		console.error('Error deleting goal:', err);
		toast.add({ title: 'Error', description: 'Failed to delete goal', color: 'error' });
	} finally {
		saving.value = false;
	}
}
</script>
