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
		<!-- Template picker (new-goal only) -->
		<div v-if="!isEditing" class="space-y-1.5">
			<div class="flex items-center justify-between">
				<label class="t-label text-muted-foreground">Start from a template</label>
				<button
					v-if="selectedTemplate"
					type="button"
					class="text-[10px] text-muted-foreground hover:text-foreground"
					@click="clearTemplate"
				>
					Clear
				</button>
			</div>
			<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
				<button
					v-for="tpl in templates"
					:key="tpl.id"
					type="button"
					class="text-left rounded-lg border p-2.5 transition-all hover:border-foreground/30"
					:class="selectedTemplate?.id === tpl.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card'"
					@click="applyTemplate(tpl)"
				>
					<div class="flex items-center gap-2 mb-1">
						<UIcon :name="tpl.icon" class="w-3.5 h-3.5" :style="{ color: tpl.accent }" />
						<span class="text-xs font-semibold">{{ tpl.name }}</span>
					</div>
					<p class="text-[10px] text-muted-foreground leading-tight">{{ tpl.tagline }}</p>
				</button>
			</div>
			<div v-if="selectedTemplate" class="rounded-md border border-warning/20 bg-warning/5 p-3 mt-2">
				<div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-warning dark:text-warning font-semibold mb-1.5">
					<EarnestIcon class="w-3 h-3" />
					Reflection prompts for this template
				</div>
				<ul class="space-y-1 text-[11px] text-foreground/80">
					<li v-for="(p, i) in selectedTemplate.reflection_prompts" :key="i" class="flex gap-1.5">
						<span class="text-warning">·</span>
						<span>{{ p }}</span>
					</li>
				</ul>
			</div>
		</div>

		<!-- Title -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Title</label>
			<UInput v-model="form.title" placeholder="e.g., Reach $50K monthly revenue" />
		</div>

		<!-- Scope (pill group) -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Scope</label>
			<div class="flex gap-2 flex-wrap pt-1">
				<button
					v-for="opt in goalScopeOptions"
					:key="opt.value"
					type="button"
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
					:class="form.scope === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
					@click="form.scope = opt.value"
				>
					<UIcon :name="opt.icon" class="w-3.5 h-3.5" />
					{{ opt.label }}
				</button>
			</div>
		</div>

		<!-- Category (pill group) -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Category</label>
			<div class="flex gap-2 flex-wrap pt-1">
				<button
					v-for="opt in goalCategoryOptions"
					:key="opt.value"
					type="button"
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
					:class="form.category === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
					@click="form.category = opt.value"
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
import { GOAL_TEMPLATES } from '~~/shared/goal-templates';

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
const { user } = useDirectusAuth();
const { createGoal, updateGoal, deleteGoal } = useGoals();

const templates = GOAL_TEMPLATES;
const selectedTemplate = ref(null);

function applyTemplate(tpl) {
	selectedTemplate.value = tpl;
	form.value = {
		...form.value,
		...tpl.prefill,
	};
}

function clearTemplate() {
	selectedTemplate.value = null;
}

const goalScopeOptions = [
	{ label: 'For me', value: 'user', icon: 'i-heroicons-user' },
	{ label: 'Team', value: 'team', icon: 'i-heroicons-user-group' },
	{ label: 'Client', value: 'client', icon: 'i-heroicons-briefcase' },
	{ label: 'Organization', value: 'organization', icon: 'i-heroicons-building-office-2' },
];

const goalCategoryOptions = [
	{ label: 'Revenue', value: 'revenue', icon: 'i-heroicons-banknotes' },
	{ label: 'Growth', value: 'growth', icon: 'i-heroicons-arrow-trending-up' },
	{ label: 'Retention', value: 'retention', icon: 'i-heroicons-heart' },
	{ label: 'Learning', value: 'learning', icon: 'i-heroicons-academic-cap' },
	{ label: 'Wellbeing', value: 'wellbeing', icon: 'i-heroicons-sun' },
	{ label: 'Delivery', value: 'delivery', icon: 'i-heroicons-truck' },
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
		scope: 'user',
		category: 'revenue',
		assigned_to: user.value?.id || null,
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

function mapTypeToCategory(t) {
	switch (t) {
		case 'financial': return 'revenue';
		case 'networking': return 'growth';
		case 'performance': return 'delivery';
		case 'marketing': return 'growth';
		default: return 'custom';
	}
}

function deriveScope(g) {
	if (g.team) return 'team';
	if (g.client) return 'client';
	if (g.assigned_to) return 'user';
	return 'organization';
}

function populateForm() {
	if (props.goal?.id) {
		const g = props.goal;
		form.value = {
			title: g.title || '',
			description: g.description || '',
			scope: g.scope || deriveScope(g),
			category: g.category || mapTypeToCategory(g.type),
			assigned_to: g.assigned_to || (g.scope === 'user' ? user.value?.id : null) || null,
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
	else selectedTemplate.value = null;
});

async function handleSubmit() {
	if (!form.value.title.trim()) return;
	saving.value = true;
	try {
		// Enforce scope invariants: scope=user MUST have assigned_to; non-user scopes clear it.
		const scope = form.value.scope || 'user';
		const assigned_to = scope === 'user' ? (form.value.assigned_to || user.value?.id || null) : null;

		// Coerce empty numeric/date strings to null — Postgres hygiene (same class as Pass 2/5/7 fixes)
		const payload = {
			...form.value,
			scope,
			assigned_to,
			target_value: form.value.target_value === '' || form.value.target_value == null ? null : Number(form.value.target_value),
			current_value: form.value.current_value === '' || form.value.current_value == null ? 0 : Number(form.value.current_value),
			start_date: form.value.start_date || null,
			end_date: form.value.end_date || null,
			metadata: selectedTemplate.value
				? { ...(form.value.metadata || {}), template_id: selectedTemplate.value.id }
				: form.value.metadata || null,
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
