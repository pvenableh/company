<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();

const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const invoice = await readItem('invoices', params.id, {
	fields: [
		'id,status,due_date,invoice_date,invoice_code,note,memo,total_amount,bill_to.id,bill_to.name,bill_to.email,bill_to.stripe_customer_id,bill_to.address,line_items.id,line_items.description,line_items.quantity,line_items.rate,line_items.amount,line_items.product.name',
	],
});
</script>
<template>
	<div class="w-full flex flex-col items-center justify-center">
		<h1 class="page__title">
			Invoice
			<span class="block">Payment</span>
		</h1>
		<div class="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center z-10 page__inner">
			<InvoicesInvoice :invoice="invoice" class="lg:sticky lg:top-12" />
			<div class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
				<PaymentMethods
					:amount="invoice.total_amount"
					:email="invoice.bill_to.email"
					:bill_to="invoice.bill_to.name"
					:user="user"
					:invoice="invoice.invoice_code"
					:id="invoice.id"
				/>
			</div>
		</div>
	</div>
</template>
<style></style>
