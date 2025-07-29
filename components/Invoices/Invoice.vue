<script setup>
const props = defineProps({
	invoice: {
		type: Object,
		required: true,
	},
});
const formatNumber = (value) => {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
};
</script>
<template>
	<div class="px-6 pt-12 pb-16 w-full border bg-white dark:bg-gray-700 bg-opacity-90 shadow invoice">
		<div class="">
			<div class="w-full flex flex-row items-center justify-between">
				<h1 class="font-bold uppercase text-xl">
					<span class="opacity-30">Invoice #:</span>
					{{ invoice.invoice_code }}
				</h1>
				<InvoicesPdfGenerator :invoice="invoice" />
			</div>
			<h5 class="font-bold uppercase text-xs">
				<span class="opacity-30">Due date:</span>
				{{ getFriendlyDateTwo(invoice.due_date) }}
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
					class="lg:pl-3 my-1 flex flex-col items-start justify-between pb-12 line-item"
				>
					<div class="w-full flex flex-col md:flex-row items-start justify-between">
						<p class="uppercase text-[12px] font-bold">{{ item.product.name }}</p>
						<div class="hidden md:flex items-center flex-grow ml-1 mr-3 min-w-[20px] h-[15px]">
							<div class="w-full border-b border-gray-200 dark:border-gray-700"></div>
						</div>
						<div
							class="text-[12px] md:text-right w-full md:w-auto flex flex-row md:justify-end items-end whitespace-nowrap"
						>
							${{ formatNumber(item.rate) }} x {{ formatNumber(item.quantity) }}
							<span class="mx-2">:</span>
							<p class="text-[12px]">${{ formatNumber(item.amount) }}</p>
						</div>
					</div>
					<div v-if="item.description" class="mt-2">
						<h5 class="uppercase text-[8px] opacity-25">Description:</h5>
						<div
							v-if="item.description"
							class="text-[12px] max-w-md line-item__description"
							v-html="item.description"
						></div>
					</div>
				</div>
				<div class="lg:ml-3 flex flex-row items-center justify-between pt-6">
					<p class="uppercase text-[12px] font-bold">Total:</p>
					<p class="text-[12px]">${{ formatNumber(invoice.total_amount) }}</p>
				</div>
			</div>
		</div>
	</div>
</template>
<style>
.invoice {
	max-width: 528px;
	@media (min-width: theme('screens.lg')) {
		max-width: 750px;
	}
	ul {
		list-style: disc;
		list-style-position: inside;
		padding-left: 0px;
		margin: 2px 0px;
		line-height: 12px;
	}
	.line-item {
		&__description {
			p {
				@apply mb-2;
			}
			p:last-child {
				@apply mb-0;
			}
		}
	}
}
</style>
