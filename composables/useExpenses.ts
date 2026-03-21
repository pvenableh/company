// composables/useExpenses.ts
// Manages expenses persisted to Directus `expenses` collection.
// Singleton reactive state for org-scoped expense tracking.

import type { Expense } from '~/types/directus';

// Shared reactive state (singleton across composable instances)
const expenses = ref<Expense[]>([]);
const isLoaded = ref(false);
const isLoading = ref(false);

const EXPENSE_FIELDS = [
	'id', 'status', 'sort', 'user_created.id', 'user_created.first_name',
	'user_created.last_name', 'user_created.avatar', 'date_created',
	'user_updated', 'date_updated', 'organization', 'name', 'category',
	'amount', 'date', 'description', 'receipt.id', 'receipt.filename_download',
	'receipt.type', 'project.id', 'project.title', 'is_billable',
	'is_reimbursable', 'vendor', 'payment_method',
];

export const EXPENSE_CATEGORIES = [
	{ value: 'software', label: 'Software & SaaS', icon: 'i-heroicons-computer-desktop', color: 'text-blue-400' },
	{ value: 'hardware', label: 'Hardware & Equipment', icon: 'i-heroicons-wrench-screwdriver', color: 'text-gray-400' },
	{ value: 'travel', label: 'Travel', icon: 'i-heroicons-paper-airplane', color: 'text-sky-400' },
	{ value: 'marketing', label: 'Marketing & Ads', icon: 'i-heroicons-megaphone', color: 'text-pink-400' },
	{ value: 'office', label: 'Office & Supplies', icon: 'i-heroicons-building-office-2', color: 'text-amber-400' },
	{ value: 'contractor', label: 'Contractor & Freelance', icon: 'i-heroicons-user-circle', color: 'text-purple-400' },
	{ value: 'hosting', label: 'Hosting & Infrastructure', icon: 'i-heroicons-server-stack', color: 'text-emerald-400' },
	{ value: 'insurance', label: 'Insurance', icon: 'i-heroicons-shield-check', color: 'text-red-400' },
	{ value: 'legal', label: 'Legal & Accounting', icon: 'i-heroicons-scale', color: 'text-indigo-400' },
	{ value: 'other', label: 'Other', icon: 'i-heroicons-receipt-percent', color: 'text-neutral-400' },
] as const;

export const useExpenses = () => {
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();
	const expenseItems = useDirectusItems('expenses');

	/** Load expenses from Directus for the current org. */
	const load = async (params?: {
		category?: string;
		status?: string;
		search?: string;
		dateFrom?: string;
		dateTo?: string;
		billableOnly?: boolean;
	}) => {
		if (import.meta.server || !user.value?.id) return;
		isLoading.value = true;
		try {
			const filter: any = { _and: [] };

			if (selectedOrg.value) {
				filter._and.push({ organization: { _eq: selectedOrg.value } });
			}
			if (params?.category) {
				filter._and.push({ category: { _eq: params.category } });
			}
			if (params?.status) {
				filter._and.push({ status: { _eq: params.status } });
			}
			if (params?.search) {
				filter._and.push({
					_or: [
						{ name: { _contains: params.search } },
						{ vendor: { _contains: params.search } },
						{ description: { _contains: params.search } },
					],
				});
			}
			if (params?.dateFrom) {
				filter._and.push({ date: { _gte: params.dateFrom } });
			}
			if (params?.dateTo) {
				filter._and.push({ date: { _lte: params.dateTo } });
			}
			if (params?.billableOnly) {
				filter._and.push({ is_billable: { _eq: true } });
			}

			// If no filters, remove the empty _and
			const finalFilter = filter._and.length ? filter : {};

			const records = await expenseItems.list({
				fields: EXPENSE_FIELDS,
				filter: finalFilter,
				sort: ['-date'],
				limit: 500,
			});

			expenses.value = (records || []) as Expense[];
		} catch (err) {
			console.error('[useExpenses] Failed to load expenses:', err);
			expenses.value = [];
		} finally {
			isLoading.value = false;
			isLoaded.value = true;
		}
	};

	/** Create a new expense. */
	const createExpense = async (data: Partial<Expense>): Promise<Expense> => {
		const payload: any = { ...data };
		if (selectedOrg.value && !payload.organization) {
			payload.organization = selectedOrg.value;
		}

		let record;
		try {
			record = await expenseItems.create(payload);
		} catch (err: any) {
			console.error('[useExpenses] Failed to create expense:', err);
			throw err;
		}

		const expense = { ...record, date_created: record?.date_created || new Date().toISOString() } as Expense;
		expenses.value.unshift(expense);
		return expense;
	};

	/** Update an existing expense. */
	const updateExpense = async (id: string, data: Partial<Expense>): Promise<void> => {
		const payload: any = { ...data };

		// Optimistic local update
		const idx = expenses.value.findIndex((e) => e.id === id);
		if (idx !== -1) {
			expenses.value[idx] = { ...expenses.value[idx], ...payload };
		}

		try {
			await expenseItems.update(id, payload);
		} catch (err) {
			console.error('[useExpenses] Failed to update expense:', err);
			await load();
		}
	};

	/** Delete an expense. */
	const deleteExpense = async (id: string): Promise<void> => {
		expenses.value = expenses.value.filter((e) => e.id !== id);
		try {
			await expenseItems.remove(id);
		} catch (err) {
			console.error('[useExpenses] Failed to delete expense:', err);
			await load();
		}
	};

	// ── Computed aggregations ──

	const totalExpenses = computed(() =>
		expenses.value.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
	);

	const expensesByCategory = computed(() => {
		const grouped: Record<string, { total: number; count: number }> = {};
		for (const expense of expenses.value) {
			const cat = expense.category || 'other';
			if (!grouped[cat]) grouped[cat] = { total: 0, count: 0 };
			grouped[cat].total += Number(expense.amount) || 0;
			grouped[cat].count += 1;
		}
		return grouped;
	});

	const billableExpenses = computed(() =>
		expenses.value.filter((e) => e.is_billable),
	);

	const reimbursableExpenses = computed(() =>
		expenses.value.filter((e) => e.is_reimbursable),
	);

	/** Fetch quarterly expense totals for a given year (standalone, doesn't use singleton state). */
	const getQuarterlyExpenses = async (year: number): Promise<{ q1: number; q2: number; q3: number; q4: number; total: number }> => {
		try {
			const filter: any = {
				_and: [
					{ date: { _gte: `${year}-01-01` } },
					{ date: { _lte: `${year}-12-31` } },
				],
			};
			if (selectedOrg.value) {
				filter._and.push({ organization: { _eq: selectedOrg.value } });
			}

			const records = await expenseItems.list({
				fields: ['amount', 'date'],
				filter,
				limit: 1000,
			});

			const quarters = { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };
			for (const r of records as any[]) {
				const month = new Date(r.date).getMonth();
				const amount = Number(r.amount) || 0;
				if (month < 3) quarters.q1 += amount;
				else if (month < 6) quarters.q2 += amount;
				else if (month < 9) quarters.q3 += amount;
				else quarters.q4 += amount;
				quarters.total += amount;
			}
			return quarters;
		} catch (err) {
			console.error('[useExpenses] Failed to get quarterly expenses:', err);
			return { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };
		}
	};

	// Load on init if not already loaded
	if (!isLoaded.value && !isLoading.value) {
		load();
	}

	// Reload when user changes
	watch(() => user.value?.id, () => {
		isLoaded.value = false;
		load();
	});

	return {
		expenses: readonly(expenses),
		isLoading: readonly(isLoading),
		totalExpenses,
		expensesByCategory,
		billableExpenses,
		reimbursableExpenses,
		createExpense,
		updateExpense,
		deleteExpense,
		getQuarterlyExpenses,
		refresh: load,
	};
};
