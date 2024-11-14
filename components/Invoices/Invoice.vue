<script setup>
const props = defineProps({
	invoice: {
		type: Object,
		required: true,
	},
});
</script>
<template>
	<div class="px-6 pt-12 pb-16 w-full border bg-white dark:bg-gray-700 bg-opacity-90 shadow invoice">
		<div class="">
			<div class="w-full flex flex-row items-center justify-between">
				<h1 class="font-bold uppercase text-xl">
					<span class="opacity-30">Invoice #:</span>
					{{ invoice.invoice_code }}
				</h1>
				<UButton
					size="sm"
					variant="outline"
					:ui="{ rounded: 'rounded-full' }"
					icon="i-heroicons-document-arrow-down"
					class="text-gray-500 dark:text-gray-400"
				/>
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
			<div v-if="invoice.note" class="text-[12px] invoice__note" v-html="invoice.note"></div>
			<div v-if="invoice.line_items.length > 0" class="w-full mt-6">
				<h5 class="uppercase tracking-wide text-[9px] mb-6">Line Items:</h5>
				<div
					v-for="(item, index) in invoice.line_items"
					:key="index"
					class="lg:pl-3 my-1 flex flex-row items-center justify-between"
				>
					<div class="">
						<p class="uppercase lg:tracking-wide text-[12px] font-bold">{{ item.product.name }}</p>
						<p v-if="item.description" class="text-[9px]">
							{{ item.description }}
						</p>
					</div>
					<div class="mx-3 grow border-b border-gray-200 dark:border-gray-700"></div>
					<div class="lg:tracking-wide text-[12px]">${{ item.rate }} x {{ item.quantity }}:</div>
					<p class="lg:tracking-wide text-[12px]">${{ item.amount }}</p>
				</div>
				<div class="lg:ml-3 flex flex-row items-center justify-between border-t mt-6 pt-6">
					<p class="uppercase tracking-wide text-[12px] font-bold">Total:</p>
					<p class="tracking-wide text-[12px]">${{ invoice.total_amount }}</p>
				</div>
			</div>
		</div>
	</div>
</template>
<style>
.invoice {
	max-width: 528px;
	@media (min-width: theme('screens.lg')) {
		/* min-width: 500px; */
	}
}
</style>
