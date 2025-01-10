<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();
const { user } = useDirectusAuth();

// Remove auth middleware
definePageMeta({
	// middleware: ['auth'], // Removed
});

const invoice = await readItem('invoices', params.id, {
	fields: [
		'id,status,due_date,invoice_date,invoice_code,note,memo,total_amount,bill_to.id,bill_to.name,bill_to.email,bill_to.emails,bill_to.stripe_customer_id,bill_to.address,line_items.id,line_items.description,line_items.quantity,line_items.rate,line_items.amount,line_items.product.name',
	],
});

const anonymousUser = ref(null);
const showAnonymousForm = computed(() => !user.value && !anonymousUser.value);

const defaultEmail = computed(() => {
	return invoice.bill_to.emails?.[0] || '';
});

const handleAnonymousSubmit = async (formData) => {
	anonymousUser.value = {
		email: formData.email,
	};
};
</script>
<template>
	<div class="w-full flex flex-col items-center justify-center">
		<h1 class="page__title">
			Invoice
			<span class="block">Payment</span>
		</h1>
		<div class="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center z-10 page__inner">
			<InvoicesInvoice :invoice="invoice" class="lg:sticky lg:top-12" />
			<div v-if="showAnonymousForm" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
				<PaymentAnonymous :default-email="defaultEmail" @submit="handleAnonymousSubmit" />
			</div>
			<div v-else-if="invoice.status !== 'paid'" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
				<PaymentMethods
					:amount="invoice.total_amount"
					:email="user ? user.email : anonymousUser.email"
					:bill_to="invoice.bill_to"
					:user="user || anonymousUser"
					:invoice="invoice"
					:is-anonymous="!user"
				/>
			</div>
		</div>
	</div>
</template>
<style></style>
