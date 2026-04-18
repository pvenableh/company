<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Expense' : 'New Expense'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!form.name.trim() || !form.amount"
		:statuses="expenseStatuses"
		:current-status="currentStatus"
		collection="expenses"
		:item-id="expense?.id ?? null"
		@submit="handleSubmit"
		@delete="handleDelete"
		@status-change="e => currentStatus = e.newStatus"
	>
		<!-- Name -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Name *</label>
			<UInput v-model="form.name" placeholder="e.g., Adobe Creative Cloud subscription" />
		</div>

		<!-- Category + Amount -->
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Category</label>
				<select
					v-model="form.category"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option v-for="cat in EXPENSE_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
				</select>
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Amount ($) *</label>
				<UInput v-model.number="form.amount" type="number" step="0.01" min="0" placeholder="0.00" />
			</div>
		</div>

		<!-- Date + Vendor -->
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Date</label>
				<UInput v-model="form.date" type="date" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Vendor</label>
				<UInput v-model="form.vendor" placeholder="Company name" />
			</div>
		</div>

		<!-- Status (create-only; edit uses timeline) + Payment Method -->
		<div class="grid grid-cols-2 gap-3">
			<div v-if="!isEditing" class="space-y-1">
				<label class="t-label text-muted-foreground">Status</label>
				<select
					v-model="currentStatus"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
				</select>
			</div>
			<div class="space-y-1" :class="{ 'col-span-2': isEditing }">
				<label class="t-label text-muted-foreground">Payment Method</label>
				<select
					v-model="form.payment_method"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option v-for="pm in paymentMethods" :key="pm.value" :value="pm.value">{{ pm.label }}</option>
				</select>
			</div>
		</div>

		<!-- Toggles -->
		<div class="flex items-center gap-6 pt-1">
			<label class="flex items-center gap-2 cursor-pointer">
				<input v-model="form.is_billable" type="checkbox" class="rounded border-border text-primary focus:ring-primary" />
				<span class="text-sm text-foreground">Billable</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<input v-model="form.is_reimbursable" type="checkbox" class="rounded border-border text-primary focus:ring-primary" />
				<span class="text-sm text-foreground">Reimbursable</span>
			</label>
		</div>

		<!-- Description -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Notes</label>
			<UTextarea v-model="form.description" :rows="2" placeholder="Optional notes about this expense" />
		</div>
	</FormModal>
</template>

<script setup lang="ts">
const props = defineProps<{
	expense?: any;
}>();

const emit = defineEmits<{
	saved: [];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.expense?.id);
const saving = ref(false);

const toast = useToast();
const { createExpense, updateExpense, deleteExpense } = useExpenses();
const { EXPENSE_CATEGORIES } = await import('~/composables/useExpenses');

const statusOptions = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'submitted', label: 'Submitted' },
	{ value: 'approved', label: 'Approved' },
	{ value: 'paid', label: 'Paid' },
	{ value: 'rejected', label: 'Rejected' },
];

const expenseStatuses = statusOptions.map(s => ({ id: s.value, name: s.label }));

const paymentMethods = [
	{ value: '', label: 'None' },
	{ value: 'cash', label: 'Cash' },
	{ value: 'credit_card', label: 'Credit Card' },
	{ value: 'bank_transfer', label: 'Bank Transfer' },
	{ value: 'check', label: 'Check' },
	{ value: 'other', label: 'Other' },
];

const currentStatus = ref('draft');

function defaultForm() {
	return {
		name: '',
		category: 'other',
		amount: null as number | null,
		date: new Date().toISOString().split('T')[0] as string,
		description: '',
		vendor: '',
		payment_method: '',
		is_billable: false,
		is_reimbursable: false,
		project: null as string | null,
	};
}

const form = ref(defaultForm());

function populateForm() {
	if (props.expense?.id) {
		const e = props.expense;
		form.value = {
			name: e.name || '',
			category: e.category || 'other',
			amount: e.amount,
			date: e.date || new Date().toISOString().split('T')[0],
			description: e.description || '',
			vendor: e.vendor || '',
			payment_method: e.payment_method || '',
			is_billable: e.is_billable || false,
			is_reimbursable: e.is_reimbursable || false,
			project: typeof e.project === 'object' ? e.project?.id : e.project || null,
		};
		currentStatus.value = e.status || 'draft';
	} else {
		form.value = defaultForm();
		currentStatus.value = 'draft';
	}
}

watch(isOpen, (open) => {
	if (open) populateForm();
});

async function handleSubmit() {
	if (!form.value.name.trim() || !form.value.amount) return;
	saving.value = true;
	try {
		const payload = {
			...form.value,
			status: currentStatus.value,
			amount: form.value.amount === null || form.value.amount === undefined ? null : Number(form.value.amount),
		};

		if (isEditing.value) {
			await updateExpense(props.expense.id, payload);
			toast.add({ title: 'Expense updated', color: 'success' });
		} else {
			await createExpense(payload);
			toast.add({ title: 'Expense created', color: 'success' });
		}
		emit('saved');
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving expense:', err);
		toast.add({ title: 'Error', description: 'Failed to save expense', color: 'error' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.expense?.id) return;
	if (!confirm(`Delete "${props.expense.name}"? This cannot be undone.`)) return;

	saving.value = true;
	try {
		await deleteExpense(props.expense.id);
		toast.add({ title: 'Expense deleted', color: 'success' });
		emit('deleted', String(props.expense.id));
		emit('saved');
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting expense:', err);
		toast.add({ title: 'Error', description: 'Failed to delete expense', color: 'error' });
	} finally {
		saving.value = false;
	}
}
</script>
