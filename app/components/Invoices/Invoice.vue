<script setup>
import { shouldHideEarnestFooter } from '~~/shared/branding';
import { sanitizeInvoiceHtml } from '~/utils/sanitizeHtml';

const props = defineProps({
	invoice: {
		type: Object,
		required: true,
	},
});
const config = useRuntimeConfig();
const safeHtml = sanitizeInvoiceHtml;

const hideFooter = computed(() => {
	const seller = props.invoice?.bill_to;
	return shouldHideEarnestFooter({ whitelabel: seller?.whitelabel, plan: seller?.plan });
});

const formatNumber = (value) => {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
};

const sellerLogoUrl = computed(() => {
	const logo = props.invoice?.bill_to?.logo;
	if (!logo) return null;
	const id = typeof logo === 'string' ? logo : logo?.id;
	if (!id) return null;
	return `${config.public.directusUrl}/assets/${id}?key=medium-contain`;
});
</script>
<template>
	<DocumentsDocumentShell :seller="invoice.bill_to" wrapper-class="invoice px-6 pt-12 pb-16 w-full">
		<!-- Seller header -->
		<div
			v-if="invoice.bill_to"
			class="flex items-start gap-4 pb-6 mb-6 doc__seller"
			style="border-bottom: 1px solid var(--doc-rule);"
		>
			<img
				v-if="sellerLogoUrl"
				:src="sellerLogoUrl"
				:alt="invoice.bill_to.name || 'Logo'"
				class="h-12 w-auto object-contain shrink-0"
			/>
			<div class="text-[10px] leading-tight">
				<p class="font-semibold text-[11px]">{{ invoice.bill_to.name }}</p>
				<p v-if="invoice.bill_to.address" class="whitespace-pre-line opacity-70">{{ invoice.bill_to.address }}</p>
				<p v-if="invoice.bill_to.phone" class="opacity-70">{{ invoice.bill_to.phone }}</p>
			</div>
		</div>

		<div class="">
			<div class="w-full flex flex-row items-center justify-between">
				<h1 class="font-semibold uppercase text-xl doc__title">
					<span class="opacity-40">Invoice #:</span>
					{{ invoice.invoice_code }}
				</h1>
				<ClientOnly>
					<DocumentsDocumentPdfGenerator
						:filename="invoice.invoice_code || 'invoice'"
						selector=".doc-shell.invoice"
						data-pdf-strip
					/>
				</ClientOnly>
			</div>
			<h5 v-if="invoice.invoice_date" class="font-semibold uppercase text-xs">
				<span class="opacity-40">Billing date:</span>
				{{ getFriendlyDateThree(invoice.invoice_date) }}
			</h5>
			<h5 class="font-semibold uppercase text-xs">
				<span class="opacity-40">Due date:</span>
				{{ getFriendlyDateThree(invoice.due_date) }}
			</h5>
			<h5 class="font-semibold uppercase text-xs">
				<span class="opacity-40">Status:</span>
				{{ invoice.status }}
			</h5>
			<h5 class="font-semibold uppercase text-xs mt-6">
				<span class="opacity-40">Bill to:</span>
				<p>{{ invoice.client?.name || invoice.bill_to?.name }}</p>
				<p v-if="invoice.billing_address || invoice.client?.billing_address">{{ invoice.billing_address || invoice.client?.billing_address }}</p>
			<template v-if="invoice.emails?.length">
				<p v-for="(e, i) in invoice.emails" :key="i" class="opacity-50">cc: {{ e }}</p>
			</template>
			</h5>

			<h5 v-if="invoice.note" class="uppercase tracking-wide text-[9px] mt-6">Note:</h5>
			<div v-if="invoice.note" class="text-[12px] invoice__note" v-html="safeHtml(invoice.note)"></div>
			<div v-if="invoice.line_items.length > 0" class="w-full mt-6">
				<h5 class="uppercase tracking-wide text-[9px] mb-6">Line Items:</h5>
				<div
					v-for="(item, index) in invoice.line_items"
					:key="index"
					class="lg:pl-3 my-1 flex flex-col items-start justify-between pb-12 line-item"
				>
					<div class="w-full flex flex-col md:flex-row items-start justify-between">
						<p class="uppercase text-[12px] font-semibold">{{ item.product?.name || 'Item' }}</p>
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
							v-html="safeHtml(item.description)"
						></div>
					</div>
				</div>
				<div class="lg:ml-3 flex flex-row items-center justify-between pt-6">
					<p class="uppercase text-[12px] font-semibold">Total:</p>
					<p class="text-[12px] font-semibold">${{ formatNumber(invoice.total_amount) }}</p>
				</div>
			</div>
			<DocumentsDocumentFooter :hidden="hideFooter" />
		</div>
	</DocumentsDocumentShell>
</template>
<style>
@reference "~/assets/css/tailwind.css";
.invoice {
	max-width: 528px;
	@media (min-width: theme('screens.lg')) {
		max-width: 750px;
	}
	ul,
	ol {
		list-style: disc;
		list-style-position: inside;
		padding-left: 0px;
		margin: 2px 0px;
		line-height: 1.4;
	}
	ol {
		list-style: decimal;
	}
	/* Keep each line item on a single page when printing/exporting */
	.line-item {
		page-break-inside: avoid;
		break-inside: avoid;
	}
	.line-item__description {
		p {
			@apply mb-2;
		}
		p:last-child {
			@apply mb-0;
		}
		ul,
		ol {
			page-break-inside: avoid;
			break-inside: avoid;
		}
	}
	/* Time-block tables produced by generateInvoiceFromEntries */
	.time-block {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
		margin-top: 4px;
		page-break-inside: avoid;
		break-inside: avoid;
	}
	.time-block th,
	.time-block td {
		border-bottom: 1px solid var(--doc-rule, rgba(0, 0, 0, 0.08));
		padding: 3px 6px;
		text-align: left;
		vertical-align: top;
	}
	.time-block th {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 9px;
		opacity: 0.5;
	}
	.time-block td:nth-child(1),
	.time-block td:nth-child(2),
	.time-block th:nth-child(1),
	.time-block th:nth-child(2) {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.time-block td:nth-child(2),
	.time-block th:nth-child(2) {
		text-align: right;
	}
}
</style>
