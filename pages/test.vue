<template>
	<div>
		<h1 class="text-2xl font-bold mb-4">Tickets Board</h1>
		{{ userOrganizationIds }}
		<div v-for="invoice in invoices" :key="invoice.id" class="mb-4 block">
			{{ invoice.invoice_code }}
			<!-- {{ invoice.bill_to.name }} = {{ userOrganizationIds.includes(invoice.bill_to.id) }} -->
		</div>
	</div>
</template>

<script setup>
definePageMeta({
	middleware: ['auth'],
});

const { user } = useDirectusAuth();
const { readItems } = useDirectusItems();

console.log(user);
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
</script>
