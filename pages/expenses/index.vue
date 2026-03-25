<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Expenses | Earnest' });

const { expenses, isLoading, totalExpenses, expensesByCategory, billableExpenses, reimbursableExpenses, createExpense, updateExpense, deleteExpense, refresh } = useExpenses();
const { EXPENSE_CATEGORIES } = await import('~/composables/useExpenses');

const toast = useToast();

// ── Filters ──
const searchQuery = ref('');
const filterCategory = ref('');
const filterStatus = ref('');
const showBillableOnly = ref(false);
const viewMode = ref<'cards' | 'table'>('table');

const filteredExpenses = computed(() => {
	let result = [...expenses.value];
	if (searchQuery.value) {
		const q = searchQuery.value.toLowerCase();
		result = result.filter(e =>
			(e.name || '').toLowerCase().includes(q) ||
			(e.vendor || '').toLowerCase().includes(q) ||
			(e.description || '').toLowerCase().includes(q),
		);
	}
	if (filterCategory.value) {
		result = result.filter(e => e.category === filterCategory.value);
	}
	if (filterStatus.value) {
		result = result.filter(e => e.status === filterStatus.value);
	}
	if (showBillableOnly.value) {
		result = result.filter(e => e.is_billable);
	}
	return result;
});

// ── Stats ──
const filteredTotal = computed(() => filteredExpenses.value.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
const billableTotal = computed(() => billableExpenses.value.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

// ── Create/Edit Modal ──
const showModal = ref(false);
const editingExpense = ref<any>(null);
const saving = ref(false);

const defaultForm = () => ({
	name: '',
	category: 'other',
	amount: null as number | null,
	date: new Date().toISOString().split('T')[0] as string,
	description: '',
	vendor: '',
	payment_method: '',
	is_billable: false,
	is_reimbursable: false,
	status: 'draft',
	project: null as string | null,
});

const form = ref(defaultForm());

watch(showModal, (open) => {
	if (open && editingExpense.value) {
		form.value = {
			name: editingExpense.value.name || '',
			category: editingExpense.value.category || 'other',
			amount: editingExpense.value.amount,
			date: editingExpense.value.date || (new Date().toISOString().split('T')[0] as string),
			description: editingExpense.value.description || '',
			vendor: editingExpense.value.vendor || '',
			payment_method: editingExpense.value.payment_method || '',
			is_billable: editingExpense.value.is_billable || false,
			is_reimbursable: editingExpense.value.is_reimbursable || false,
			status: editingExpense.value.status || 'draft',
			project: typeof editingExpense.value.project === 'object' ? editingExpense.value.project?.id : editingExpense.value.project || null,
		};
	} else if (open) {
		form.value = defaultForm();
	}
});

const openCreate = () => {
	editingExpense.value = null;
	showModal.value = true;
};

const openEdit = (expense: any) => {
	editingExpense.value = expense;
	showModal.value = true;
};

const handleSave = async () => {
	if (!form.value.name.trim() || !form.value.amount) return;
	saving.value = true;
	try {
		if (editingExpense.value) {
			await updateExpense(editingExpense.value.id, { ...form.value });
			toast.add({ title: 'Expense updated', color: 'success' });
		} else {
			await createExpense({ ...form.value });
			toast.add({ title: 'Expense created', color: 'success' });
		}
		showModal.value = false;
	} catch {
		toast.add({ title: 'Error', description: 'Failed to save expense', color: 'error' });
	} finally {
		saving.value = false;
	}
};

const handleDelete = async (expense: any) => {
	if (!confirm(`Delete "${expense.name}"?`)) return;
	try {
		await deleteExpense(expense.id);
		toast.add({ title: 'Expense deleted', color: 'success' });
	} catch {
		toast.add({ title: 'Error', description: 'Failed to delete expense', color: 'error' });
	}
};

// ── Helpers ──
const formatCurrency = (val: number) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);

const formatDate = (dateStr: string) => {
	if (!dateStr) return '';
	return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getCategoryConfig = (cat: string) =>
	EXPENSE_CATEGORIES.find(c => c.value === cat) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

const statusColors: Record<string, string> = {
	draft: 'bg-gray-500/20 text-gray-400',
	submitted: 'bg-blue-500/20 text-blue-400',
	approved: 'bg-emerald-500/20 text-emerald-400',
	paid: 'bg-green-500/20 text-green-400',
	rejected: 'bg-red-500/20 text-red-400',
};

const paymentMethods = [
	{ value: '', label: 'None' },
	{ value: 'cash', label: 'Cash' },
	{ value: 'credit_card', label: 'Credit Card' },
	{ value: 'bank_transfer', label: 'Bank Transfer' },
	{ value: 'check', label: 'Check' },
	{ value: 'other', label: 'Other' },
];

const statusOptions = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'submitted', label: 'Submitted' },
	{ value: 'approved', label: 'Approved' },
	{ value: 'paid', label: 'Paid' },
	{ value: 'rejected', label: 'Rejected' },
];
</script>

<template>
	<div class="p-4 md:p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-semibold text-foreground">Expenses</h1>
				<p class="text-sm text-muted-foreground">Track and manage business expenses</p>
			</div>
			<button
				@click="openCreate"
				class="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
			>
				<UIcon name="i-heroicons-plus" class="w-4 h-4" />
				Add Expense
			</button>
		</div>

		<!-- Stats Row -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
			<div class="ios-card p-4 text-center">
				<p class="text-lg font-bold text-foreground">{{ formatCurrency(filteredTotal) }}</p>
				<p class="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
			</div>
			<div class="ios-card p-4 text-center">
				<p class="text-lg font-bold text-foreground">{{ filteredExpenses.length }}</p>
				<p class="text-[10px] uppercase tracking-wide text-muted-foreground">Expenses</p>
			</div>
			<div class="ios-card p-4 text-center">
				<p class="text-lg font-bold text-blue-400">{{ formatCurrency(billableTotal) }}</p>
				<p class="text-[10px] uppercase tracking-wide text-muted-foreground">Billable</p>
			</div>
			<div class="ios-card p-4 text-center">
				<p class="text-lg font-bold text-purple-400">{{ reimbursableExpenses.length }}</p>
				<p class="text-[10px] uppercase tracking-wide text-muted-foreground">Reimbursable</p>
			</div>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap gap-2 mb-4">
			<input
				v-model="searchQuery"
				type="text"
				placeholder="Search expenses..."
				class="flex-1 min-w-[180px] bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
			/>
			<select
				v-model="filterCategory"
				class="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
			>
				<option value="">All Categories</option>
				<option v-for="cat in EXPENSE_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
			</select>
			<select
				v-model="filterStatus"
				class="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
			>
				<option value="">All Statuses</option>
				<option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
			</select>
			<button
				@click="showBillableOnly = !showBillableOnly"
				class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
				:class="showBillableOnly ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'"
			>
				Billable
			</button>
			<!-- View Toggle -->
			<div class="flex gap-0.5 p-0.5 bg-muted/40 rounded-lg ml-auto">
				<button
					@click="viewMode = 'table'"
					class="p-1.5 rounded-md transition-all"
					:class="viewMode === 'table' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
				>
					<Icon name="lucide:list" class="w-4 h-4" />
				</button>
				<button
					@click="viewMode = 'cards'"
					class="p-1.5 rounded-md transition-all"
					:class="viewMode === 'cards' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
				>
					<Icon name="lucide:layout-grid" class="w-4 h-4" />
				</button>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="isLoading && !expenses.length" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!filteredExpenses.length" class="text-center py-20">
			<UIcon name="i-heroicons-receipt-percent" class="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
			<p class="text-muted-foreground text-sm">{{ expenses.length ? 'No expenses match your filters' : 'No expenses yet' }}</p>
			<button
				v-if="!expenses.length"
				@click="openCreate"
				class="mt-3 text-sm text-primary hover:underline"
			>
				Add your first expense
			</button>
		</div>

		<!-- TABLE VIEW -->
		<div v-else-if="viewMode === 'table'" class="ios-card overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border/50">
							<th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Expense</th>
							<th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Category</th>
							<th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Vendor</th>
							<th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
							<th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
							<th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Amount</th>
							<th class="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Flags</th>
							<th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-20"></th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="expense in filteredExpenses"
							:key="expense.id"
							class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
							@click="openEdit(expense)"
						>
							<td class="py-3 px-4">
								<span class="font-medium">{{ expense.name }}</span>
							</td>
							<td class="py-3 px-4">
								<div class="flex items-center gap-1.5">
									<UIcon
										:name="getCategoryConfig(expense.category || 'other')?.icon ?? 'i-heroicons-tag'"
										class="w-3.5 h-3.5"
										:class="getCategoryConfig(expense.category || 'other')?.color ?? 'text-muted-foreground'"
									/>
									<span class="text-muted-foreground text-xs">{{ getCategoryConfig(expense.category || 'other')?.label ?? 'Other' }}</span>
								</div>
							</td>
							<td class="py-3 px-4 text-muted-foreground">{{ expense.vendor || '\u2014' }}</td>
							<td class="py-3 px-4 text-muted-foreground">{{ formatDate(expense.date) }}</td>
							<td class="py-3 px-4">
								<span
									class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
									:class="statusColors[expense.status || 'draft']"
								>
									{{ expense.status || 'draft' }}
								</span>
							</td>
							<td class="py-3 px-4 text-right font-medium tabular-nums">{{ formatCurrency(Number(expense.amount) || 0) }}</td>
							<td class="py-3 px-4 text-center">
								<div class="flex items-center justify-center gap-1">
									<span v-if="expense.is_billable" class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/20 text-blue-400">B</span>
									<span v-if="expense.is_reimbursable" class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/20 text-purple-400">R</span>
								</div>
							</td>
							<td class="py-3 px-4 text-right" @click.stop>
								<button
									@click="handleDelete(expense)"
									class="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors"
								>
									<UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
								</button>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- CARD VIEW -->
		<div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
			<div
				v-for="expense in filteredExpenses"
				:key="expense.id"
				class="ios-card p-4 hover:ring-1 hover:ring-white/10 transition-all cursor-pointer group"
				@click="openEdit(expense)"
			>
				<div class="flex items-start gap-3">
					<!-- Category Icon -->
					<div class="w-9 h-9 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0">
						<UIcon
							:name="getCategoryConfig(expense.category || 'other')?.icon ?? 'i-heroicons-tag'"
							class="w-4.5 h-4.5"
							:class="getCategoryConfig(expense.category || 'other')?.color ?? 'text-muted-foreground'"
						/>
					</div>

					<div class="flex-1 min-w-0">
						<div class="flex items-start justify-between gap-2">
							<p class="text-sm font-medium text-foreground truncate">{{ expense.name }}</p>
							<p class="text-sm font-bold text-foreground whitespace-nowrap">{{ formatCurrency(Number(expense.amount) || 0) }}</p>
						</div>

						<div class="flex items-center gap-2 mt-1">
							<span class="text-[11px] text-muted-foreground">{{ formatDate(expense.date) }}</span>
							<span v-if="expense.vendor" class="text-[11px] text-muted-foreground truncate">· {{ expense.vendor }}</span>
						</div>

						<!-- Badges -->
						<div class="flex flex-wrap gap-1.5 mt-2">
							<span
								class="px-1.5 py-0.5 rounded text-[10px] font-medium"
								:class="statusColors[expense.status || 'draft']"
							>
								{{ expense.status || 'draft' }}
							</span>
							<span
								class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 text-muted-foreground"
							>
								{{ getCategoryConfig(expense.category || 'other')?.label ?? 'Other' }}
							</span>
							<span v-if="expense.is_billable" class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
								Billable
							</span>
							<span v-if="expense.is_reimbursable" class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">
								Reimbursable
							</span>
						</div>

						<!-- Project tag -->
						<div v-if="expense.project && typeof expense.project === 'object'" class="mt-2">
							<span class="text-[10px] text-muted-foreground/70">
								<UIcon name="i-heroicons-square-3-stack-3d" class="w-3 h-3 inline" />
								{{ (expense.project as any).title }}
							</span>
						</div>
					</div>
				</div>

				<!-- Delete button -->
				<button
					@click.stop="handleDelete(expense)"
					class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-500 transition-all"
				>
					<UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>

		<!-- Create/Edit Modal -->
		<UModal v-model="showModal">
			<div class="space-y-4 p-1">
				<div>
					<h2 class="text-lg font-semibold text-foreground">{{ editingExpense ? 'Edit Expense' : 'New Expense' }}</h2>
					<p class="text-sm text-muted-foreground mt-0.5">Track a business expense</p>
				</div>

				<!-- Name -->
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Name</label>
					<input
						v-model="form.name"
						type="text"
						placeholder="e.g., Adobe Creative Cloud subscription"
						class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
					/>
				</div>

				<!-- Category & Amount -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Category</label>
						<select
							v-model="form.category"
							class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
						>
							<option v-for="cat in EXPENSE_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
						</select>
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Amount ($)</label>
						<input
							v-model.number="form.amount"
							type="number"
							step="0.01"
							min="0"
							placeholder="0.00"
							class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
				</div>

				<!-- Date & Vendor -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Date</label>
						<input
							v-model="form.date"
							type="date"
							class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Vendor</label>
						<input
							v-model="form.vendor"
							type="text"
							placeholder="Company name"
							class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
				</div>

				<!-- Status & Payment Method -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Status</label>
						<select
							v-model="form.status"
							class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
						>
							<option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
						</select>
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Payment Method</label>
						<select
							v-model="form.payment_method"
							class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
						>
							<option v-for="pm in paymentMethods" :key="pm.value" :value="pm.value">{{ pm.label }}</option>
						</select>
					</div>
				</div>

				<!-- Toggles -->
				<div class="flex items-center gap-6">
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
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Notes</label>
					<textarea
						v-model="form.description"
						rows="2"
						placeholder="Optional notes about this expense"
						class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
					/>
				</div>

				<!-- Actions -->
				<div class="flex justify-end gap-2 pt-2">
					<button
						@click="showModal = false"
						class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg"
					>
						Cancel
					</button>
					<button
						@click="handleSave"
						:disabled="!form.name.trim() || !form.amount || saving"
						class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
					>
						{{ saving ? 'Saving...' : editingExpense ? 'Update Expense' : 'Create Expense' }}
					</button>
				</div>
			</div>
		</UModal>
	</div>
</template>
