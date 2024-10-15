<script setup>
definePageMeta({
	middleware: ['auth'],
});

const router = useRouter();
const { user } = useDirectusAuth();
const { readItems } = useDirectusItems();

const columns = [
	{
		key: 'invoice_code',
		label: 'Invoice',
		sortable: true,
	},
	{
		key: 'status',
		label: 'Status',
		sortable: true,
	},

	{
		key: 'due_date',
		label: 'Due Date',
		sortable: true,
	},
	{
		key: 'amount',
		label: 'Amount',
	},
	{
		key: 'bill_to.name',
		label: 'Organization',
		sortable: true,
	},

	{
		key: 'actions',
	},
];

const items = (row) => [
	[
		{
			label: 'Edit',
			icon: 'i-heroicons-pencil-square-20-solid',
			click: () => router.push('/tickets/' + row.id),
		},
		{
			label: 'Archive',
			icon: 'i-heroicons-archive-box-20-solid',
		},
	],
	[
		{
			label: 'Delete',
			icon: 'i-heroicons-trash-20-solid',
		},
	],
];

const userOrganizationIds = user.value.organizations.map((org) => org.organizations_id.id);

const filter = {
	bill_to: {
		id: {
			_in: userOrganizationIds,
		},
	},
};

const invoices = await readItems('invoices', {
	fields: ['id,status,due_date,amount,invoice_code,description,bill_to.id,bill_to.name'],
	sort: 'due_date',
	filter: filter,
});

const isPastDue = (dateString) => {
	const dueDate = new Date(dateString);
	const today = new Date();
	return dueDate < today;
};

const classedInvoices = computed(() => {
	return invoices.map((item) => ({
		...item,
		class: isPastDue(item.due_date) ? 'bg-red-500/50 dark:bg-red-400/50 animate-pulse' : '',
	}));
});

const q = ref('');

const filteredInvoices = computed(() => {
	if (!q.value) {
		return classedInvoices.value;
	}

	return classedInvoices.value.filter((item) => {
		return Object.values(item).some((value) => {
			return String(value).toLowerCase().includes(q.value.toLowerCase());
		});
	});
});
</script>
<template>
	<div class="w-full px-12 tickets">
		<div class="flex px-3 py-3.5 border-b border-gray-200 dark:border-gray-700">
			<UInput v-model="q" placeholder="Filter..." />
		</div>
		<UTable :rows="filteredInvoices" :columns="columns" class="shadow-lg border">
			<template #invoice_code-data="{ row }">
				<nuxt-link :to="'/invoices/' + row.id">{{ row.invoice_code }}</nuxt-link>
			</template>
			<template #due_date-data="{ row }">
				<p>{{ getFriendlyDateThree(row.due_date) }}</p>
				<p v-if="row.status !== 'paid'">{{ formatDueDate(row.due_date) }}</p>
			</template>
			<template #actions-data="{ row }">
				<UButton v-if="row.status === 'pending'" size="sm" color="primary" @click="handleAction(row)">Pay</UButton>
				<!-- <UDropdown :items="items(row)">
					<UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
				</UDropdown> -->
			</template>
			<template #expand="{ row }">
				<div class="p-8">
					<h5 class="uppercase tracking-wide text-[9px]">Description:</h5>
					<div class="" v-html="row.description"></div>
				</div>
			</template>
		</UTable>
	</div>
</template>
<style>
.tickets {
	th {
		font-size: 10px !important;
		@apply uppercase font-bold tracking-wide;
		button {
			font-size: 10px !important;
		}
	}
}
</style>
