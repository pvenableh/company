<script setup lang="ts">
/**
 * Shared branded header for invoices, proposals, and contracts.
 * Mirrors the existing invoice header (Invoices/Invoice.vue lines 27-76)
 * so all three document types render identically.
 */

interface SellerInfo {
	name?: string | null;
	logo?: string | { id?: string } | null;
	address?: string | null;
	phone?: string | null;
	email?: string | null;
	website?: string | null;
}

interface RecipientInfo {
	name?: string | null;
	address?: string | null;
	emails?: string[] | null;
}

interface DocumentMeta {
	kind: string;        // "INVOICE" | "PROPOSAL" | "CONTRACT"
	code?: string | null;
	date?: string | null;
	dateLabel?: string;  // "Billing date" | "Issued" | "Sent"
	expiresAt?: string | null;
	expiresLabel?: string;  // "Due date" | "Valid until" | "Expires"
	status?: string | null;
}

const props = defineProps<{
	seller: SellerInfo | null;
	recipient: RecipientInfo | null;
	doc: DocumentMeta;
}>();

const config = useRuntimeConfig();

const sellerLogoUrl = computed(() => {
	const logo = props.seller?.logo;
	if (!logo) return null;
	const id = typeof logo === 'string' ? logo : logo?.id;
	if (!id) return null;
	return `${config.public.directusUrl}/assets/${id}?key=medium-contain`;
});

function fmtDate(d: string | null | undefined) {
	if (!d) return '';
	const date = new Date(d);
	if (isNaN(date.getTime())) return d;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
</script>

<template>
	<div>
		<!-- Seller header -->
		<div
			v-if="seller"
			class="flex items-start gap-4 pb-6 mb-6 border-b border-gray-200 dark:border-gray-600 doc__seller"
		>
			<img
				v-if="sellerLogoUrl"
				:src="sellerLogoUrl"
				:alt="seller.name || 'Logo'"
				class="h-12 w-auto object-contain shrink-0"
			/>
			<div class="text-[10px] uppercase leading-tight tracking-wide">
				<p class="font-bold text-[11px]">{{ seller.name }}</p>
				<p v-if="seller.address" class="whitespace-pre-line opacity-70">{{ seller.address }}</p>
				<p v-if="seller.phone" class="opacity-70">{{ seller.phone }}</p>
				<p v-if="seller.email" class="opacity-70">{{ seller.email }}</p>
				<p v-if="seller.website" class="opacity-70">{{ seller.website.replace(/^https?:\/\//, '') }}</p>
			</div>
		</div>

		<!-- Doc meta + recipient -->
		<div class="">
			<div class="w-full flex flex-row items-center justify-between">
				<h1 class="font-bold uppercase text-xl">
					<span class="opacity-30">{{ doc.kind }}{{ doc.code ? ' #:' : '' }}</span>
					<template v-if="doc.code"> {{ doc.code }}</template>
				</h1>
				<slot name="actions" />
			</div>
			<h5 v-if="doc.date" class="font-bold uppercase text-xs">
				<span class="opacity-30">{{ doc.dateLabel || 'Date:' }}:</span>
				{{ fmtDate(doc.date) }}
			</h5>
			<h5 v-if="doc.expiresAt" class="font-bold uppercase text-xs">
				<span class="opacity-30">{{ doc.expiresLabel || 'Valid until:' }}:</span>
				{{ fmtDate(doc.expiresAt) }}
			</h5>
			<h5 v-if="doc.status" class="font-bold uppercase text-xs">
				<span class="opacity-30">Status:</span>
				{{ doc.status }}
			</h5>

			<h5 v-if="recipient?.name" class="font-bold uppercase text-xs mt-6">
				<span class="opacity-30">Issued to:</span>
				<p>{{ recipient.name }}</p>
				<p v-if="recipient.address" class="whitespace-pre-line">{{ recipient.address }}</p>
				<template v-if="recipient.emails?.length">
					<p v-for="(e, i) in recipient.emails" :key="i" class="opacity-50">cc: {{ e }}</p>
				</template>
			</h5>
		</div>
	</div>
</template>
