<script setup>
definePageMeta({
	middleware: ['auth'],
});

const router = useRouter();
const { user } = useDirectusAuth();
const { readItems } = useDirectusItems();

const columns = [
	{
		key: 'status',
		label: '',
		sortable: true,
	},
	{
		key: 'invoice_code',
		label: 'Invoice',
		sortable: true,
	},

	{
		key: 'due_date',
		label: 'Due Date',
		sortable: true,
	},
	{
		key: 'total_amount',
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

const { organizationOptions } = useOrganization();

console.log(organizationOptions);

const userOrganizationIds = user.value.organizations.map((org) => org.organizations_id.id);

console.log(userOrganizationIds);

const filter = {
	bill_to: {
		id: {
			_in: userOrganizationIds,
		},
	},
};

console.log(filter);

const invoices = await readItems('invoices', {
	fields: [
		'id,status,due_date,invoice_date,invoice_code,note,memo,total_amount,bill_to.id,bill_to.name,bill_to.email,bill_to.stripe_customer_id,line_items.id,line_items.description,line_items.quantity,line_items.rate,line_items.amount,line_items.product.name',
	],
	sort: 'due_date',
	filter: filter,
});

const isPastDue = (dateString, status) => {
	const dueDate = new Date(dateString);
	const today = new Date();
	return dueDate < today && status !== 'paid';
};

const classedInvoices = computed(() => {
	return invoices.map((item) => ({
		...item,
		class: isPastDue(item.due_date, item.status) ? 'bg-red-200/50 dark:bg-red-400/50 animate-pulse' : '',
	}));
});

const expand = ref({
	openedRows: [],
	row: null,
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

const totalAmount = computed(() => {
	const total = filteredInvoices.value.reduce((acc, invoice) => {
		const amount = Number(invoice.total_amount);
		return acc + (isNaN(amount) ? 0 : amount); // Only add if it's a valid number
	}, 0);
	return new Intl.NumberFormat().format(total); // Format the total with commas
});

const unpaidTotalAmount = computed(() => {
	const total = filteredInvoices.value.reduce((acc, invoice) => {
		// Only include invoices that are not "paid"
		if (invoice.status !== 'paid') {
			const amount = Number(invoice.total_amount);
			return acc + (isNaN(amount) ? 0 : amount); // Only add valid numbers
		}
		return acc;
	}, 0);
	return new Intl.NumberFormat().format(total); // Format the total with commas
});

const formatNumber = (value) => {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
};
</script>
<template>
	<div class="md:px-6 mx-auto flex items-center justify-center flex-col relative tickets">
		<h1 class="page__title">Invoices</h1>
		<div class="w-full flex flex-row items-center justify-between max-w-6xl my-12">
			<UInput v-model="q" placeholder="Filter..." />
			<div class="flex flex-row uppercase text-[10px]">
				<p class="mr-6">
					<span class="">Total Billed:</span>
					${{ totalAmount }}
				</p>
				<p>
					<span class="">Total Unpaid:</span>
					${{ unpaidTotalAmount }}
				</p>
			</div>
		</div>
		<UTable
			:rows="filteredInvoices"
			:columns="columns"
			class="w-full mx-0 px-0 shadow-lg border overflow-x-auto max-w-6xl"
		>
			<template #status-data="{ row }">
				<UBadge
					size="xs"
					class="inline-block w-12 text-center uppercase text-[8px] p-0"
					:color="row.status === 'paid' ? 'black' : 'primary'"
					:variant="row.status === 'paid' ? 'subtle' : 'solid'"
				>
					{{ row.status }}
				</UBadge>
			</template>
			<template #invoice_code-data="{ row }">
				<nuxt-link :to="'/invoices/' + row.id">{{ row.invoice_code }}</nuxt-link>
			</template>

			<template #due_date-data="{ row }">
				<p class="text-[12px] leading-3 max-w-32 whitespace-pre-wrap uppercase font-bold">
					{{ getFriendlyDateThree(row.due_date) }}
				</p>
				<p
					v-if="row.status !== 'paid'"
					class="text-[9px] leading-3 max-w-20 whitespace-pre-wrap uppercase font-bold hidden"
				>
					{{ formatDueDate(row.due_date) }}
				</p>
			</template>
			<template #total_amount-data="{ row }">${{ formatNumber(row.total_amount) }}</template>
			<template #bill_to.name-data="{ row }" class="uppercase">
				<p class="text-[12px] leading-3 max-w-32 whitespace-pre-wrap uppercase font-bold">
					{{ row.bill_to.name }}
				</p>
			</template>
			<template #actions-data="{ row }">
				<UButton
					v-if="row.status !== 'paid'"
					size="xs"
					color="primary"
					:to="'/invoices/' + row.id"
					:ui="{ rounded: 'rounded-full' }"
					class="inline-block text-center w-12 tracking-wide text-[10px] p-0"
				>
					Pay
				</UButton>
				<UButton
					v-else
					size="xs"
					color="primary"
					variant="outline"
					:to="'/invoices/' + row.id"
					:ui="{ rounded: 'rounded-full' }"
					class="inline-block text-center w-12 tracking-wide text-[10px] p-0"
				>
					View
				</UButton>

				<!-- <UDropdown :items="items(row)">
					<UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
				</UDropdown> -->
			</template>

			<template #expand="{ row }">
				<div class="p-8 w-full">
					<h5 v-if="row.note" class="uppercase tracking-wide text-[9px]">Note:</h5>
					<div v-if="row.note" class="" v-html="row.note"></div>
					<div v-if="row.line_items.length > 0" class="w-full mt-6">
						<h5 class="uppercase tracking-wide text-[9px] mb-6">Line Items:</h5>
						<div
							v-for="(item, index) in row.line_items"
							:key="index"
							class="lg:pl-3 my-1 flex flex-row items-center justify-between"
						>
							<div class="">
								<p class="uppercase tracking-wide text-[12px]">{{ item.product.name }}</p>
								<p v-if="item.description" class="text-[9px]">{{ item.description }}</p>
							</div>
							<div class="mx-3 grow border-b border-gray-200 dark:border-gray-700"></div>
							<p class="tracking-wide text-[12px]">${{ item.rate }} x {{ item.quantity }} = ${{ item.amount }}</p>
						</div>
						<div class="lg:ml-3 flex flex-row items-center justify-between border-t mt-6 pt-6">
							<p class="uppercase tracking-wide text-[12px] font-bold">Total:</p>
							<p class="tracking-wide text-[12px]">${{ row.total_amount }}</p>
						</div>
					</div>
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
