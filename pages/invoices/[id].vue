<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();
const { user } = useDirectusAuth();
import * as yup from 'yup';
const toast = useToast();

const emailSchema = yup.object({
	email: yup.string().email('Please enter a valid email address').required('Email is required'),
});

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
const showAnonymousForm = computed(() => {
	return !user.value && (!anonymousUser.value || !anonymousUser.value.email.trim());
});

const defaultEmail = computed(() => {
	return invoice.bill_to.emails?.[0] || '';
});

// const handleAnonymousSubmit = async (formData) => {
// 	if (formData.email.trim()) {
// 		anonymousUser.value = {
// 			email: formData.email,
// 		};
// 	}
// };

const handleAnonymousSubmit = async (formData) => {
	try {
		// Validate email format using yup
		await emailSchema.validate({ email: formData.email });

		anonymousUser.value = {
			email: formData.email,
		};
	} catch (error) {
		toast.add({
			title: 'Invalid Email',
			description: error.message,
			color: 'red',
		});
	}
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
			<div v-if="showAnonymousForm && invoice.status !== 'paid'" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
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
