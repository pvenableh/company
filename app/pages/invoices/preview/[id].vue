<script setup>
useHead({ title: 'Invoice Preview | Earnest' });

const { params } = useRoute();
const invoiceItems = useDirectusItems('invoices');

const invoice = await invoiceItems.get(params.id, {
	fields: [
		'id,status,due_date,invoice_date,invoice_code,note,memo,total_amount,billing_email,billing_name,billing_address,emails,bill_to.id,bill_to.name,bill_to.email,bill_to.stripe_customer_id,bill_to.address,bill_to.phone,bill_to.website,bill_to.logo,bill_to.plan,bill_to.whitelabel,client.id,client.name,client.billing_name,client.billing_email,client.billing_address,client.billing_contacts,line_items.id,line_items.description,line_items.quantity,line_items.rate,line_items.amount,line_items.product.name',
	],
});
</script>
<template>
	<div class="w-full flex flex-col items-center justify-start">
		<div class="w-full flex flex-col items-center justify-center relative z-10 mt-12">
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
