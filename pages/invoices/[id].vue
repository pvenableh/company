<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();
const { data: authData, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? authData?.value?.user ?? null : null;
});
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
		'id,status,due_date,invoice_date,invoice_code,note,memo,total_amount,bill_to.id,bill_to.name,bill_to.email,bill_to.emails,bill_to.stripe_customer_id,bill_to.address,line_items.id,line_items.description,line_items.quantity,line_items.rate,line_items.amount,line_items.product.name,payments.*',
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
		<div class="w-full max-w-screen-xl mx-auto z-10">
			<nuxt-link to="/invoices" class="uppercase text-[10px] text-gray-400 px-4 2xl:px-0">
				<UIcon name="i-heroicons-arrow-left" class="-mb-0.5" />
				Back to Invoices
			</nuxt-link>
		</div>

		<div class="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center z-10 page__inner">
			<InvoicesInvoice :invoice="invoice" class="lg:sticky lg:top-12" />
			<div v-if="showAnonymousForm && invoice.status === 'pending'" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
				<PaymentAnonymous :default-email="defaultEmail" @submit="handleAnonymousSubmit" />
			</div>
			<div v-else-if="invoice.status === 'pending'" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
				<PaymentMethods
					:amount="invoice.total_amount"
					:email="user ? user.email : anonymousUser.email"
					:bill_to="invoice.bill_to"
					:user="user || anonymousUser"
					:invoice="invoice"
					:is-anonymous="!user"
				/>
			</div>
			<div
				v-else-if="invoice.status !== 'pending' && invoice.payments.length && !showAnonymousForm"
				class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl"
			>
				<h3 class="uppercase font-bold tracking-wide border-b border-gray-200 dark:border-gray-700">Payments</h3>
				<div v-for="payment in invoice.payments" :key="payment.id">
					<!-- <h5>{{ payment.payment_method }}</h5>
					<h5>{{ payment.stripe_status }}</h5>
					<UButton
						:href="payment.receipt_url"
						target="_blank"
						size="xs"
						class="mb-2"
						label="Stripe Receipt"
						:ui="{ rounded: 'rounded-full' }"
					/>
					<h5>{{ payment.status }}</h5> -->

					<InvoicesPaymentItem :payment="payment" />
				</div>
			</div>
		</div>
	</div>
</template>
<style></style>
