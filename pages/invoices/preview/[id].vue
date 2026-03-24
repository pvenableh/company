<script setup>
useHead({ title: 'Invoice Preview | Earnest' });

const { params } = useRoute();
const invoiceItems = useDirectusItems('invoices');

const invoice = await invoiceItems.get(params.id, {
	fields: [
		'id,status,due_date,invoice_date,invoice_code,note,memo,total_amount,billing_email,billing_name,billing_address,emails,bill_to.id,bill_to.name,bill_to.email,bill_to.stripe_customer_id,bill_to.address,client.id,client.name,line_items.id,line_items.description,line_items.quantity,line_items.rate,line_items.amount,line_items.product.name',
	],
});
</script>
<template>
	<div class="w-full flex flex-col items-center justify-start">
		<div class="w-full flex flex-col items-center justify-center z-10 page__inner">
			<InvoicesInvoice :invoice="invoice" />
			<nuxt-link v-if="invoice.status !== 'paid'" :to="'/invoices/' + invoice.id" class="mt-12">
				<UButton
					size="sm"
					label="Pay"
					variant="solid"
					:ui="{ rounded: 'rounded-full' }"
					icon="i-heroicons-banknotes"
					class="px-20"
				/>
			</nuxt-link>
		</div>
	</div>
</template>
<style></style>
