<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();
// const { user } = useDirectusAuth();

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
	<div class="w-full flex flex-col md:flex-row items-start justify-start">
		<div class="p-8 w-full md:w-1/2">
			<div class="w-full flex flex-row items-center justify-between">
				<h1 class="font-bold uppercase text-xl">
					<span class="opacity-30">Invoice #:</span>
					{{ invoice.invoice_code }}
				</h1>
				<UIcon name="heroicons-document-arrow-down" class="text-gray-500 dark:text-gray-400" />
			</div>
			<h5 class="font-bold uppercase text-xs">
				<span class="opacity-30">Due date:</span>
				{{ invoice.due_date }}
			</h5>
			<h5 class="font-bold uppercase text-xs">
				<span class="opacity-30">Status:</span>
				{{ invoice.status }}
			</h5>
			<h5 class="font-bold uppercase text-xs mt-6">
				<span class="opacity-30">Bill to:</span>
				<p v-if="invoice.bill_to.name">{{ invoice.bill_to.name }}</p>
				<p v-if="invoice.bill_to.email">{{ invoice.bill_to.email }}</p>
				<p v-if="invoice.bill_to.address">{{ invoice.bill_to.address }}</p>
			</h5>

			<h5 v-if="invoice.note" class="uppercase tracking-wide text-[9px] mt-6">Note:</h5>
			<div v-if="invoice.note" class="text-[12px]" v-html="invoice.note"></div>
			<div v-if="invoice.line_items.length > 0" class="w-full mt-6">
				<h5 class="uppercase tracking-wide text-[9px]">Line Items:</h5>
				<div
					v-for="(item, index) in invoice.line_items"
					:key="index"
					class="pl-10 mb-1 flex flex-row items-center justify-between"
				>
					<div class="">
						<p class="uppercase tracking-wide text-[12px]">{{ item.product.name }}</p>
						<p class="">{{ item.description }}</p>
					</div>
					<div class="mx-3 grow border-b border-gray-200 dark:border-gray-700"></div>
					<p class="tracking-wide text-[12px]">${{ item.rate }} x {{ item.quantity }} = ${{ item.amount }}</p>
				</div>
				<div class="ml-10 flex flex-row items-center justify-between border-t mt-3 pt-3">
					<p class="uppercase tracking-wide text-[12px] font-bold">Total:</p>
					<p class="tracking-wide text-[12px]">${{ invoice.total_amount }}</p>
				</div>
			</div>
		</div>
		<div class="w-full p-8 md:w-1/2">
			<PaymentMethods :amount="invoice.total_amount" :email="invoice.bill_to.email" :bill_to="invoice.bill_to.name" />
		</div>
	</div>
</template>
<style></style>
