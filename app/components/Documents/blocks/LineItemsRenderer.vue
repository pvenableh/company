<script setup lang="ts">
/**
 * line_items renderer — a clean itemized table with a totals footer. Amount
 * falls back to qty × rate when not explicitly set. Currency formatting via
 * Intl; totals apply discount then tax on the subtotal.
 */
import type { LineItemsPayload, LineItem } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: LineItemsPayload;
}>();

const items = computed<LineItem[]>(() => (Array.isArray(props.payload?.items) ? props.payload.items : []));
const showTotals = computed(() => props.payload?.show_totals !== false);

function lineAmount(it: LineItem): number {
	if (it.amount != null) return it.amount;
	return (it.quantity ?? 0) * (it.rate ?? 0);
}
const subtotal = computed(() => items.value.reduce((s, it) => s + lineAmount(it), 0));
const discount = computed(() => props.payload?.discount || 0);
const taxRate = computed(() => props.payload?.tax_rate || 0);
const taxAmount = computed(() => (subtotal.value - discount.value) * (taxRate.value / 100));
const total = computed(() => subtotal.value - discount.value + taxAmount.value);
const hasAdjustments = computed(() => discount.value !== 0 || taxRate.value !== 0);

const fmt = computed(() => {
	const currency = props.payload?.currency || 'USD';
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency });
	} catch {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
	}
});
</script>

<template>
	<div class="line-items">
		<h2 v-if="payload?.heading" class="line-items__heading">{{ payload.heading }}</h2>
		<table class="line-items__table">
			<thead>
				<tr>
					<th class="line-items__col-desc">Description</th>
					<th class="line-items__col-num">Qty</th>
					<th class="line-items__col-num">Rate</th>
					<th class="line-items__col-num">Amount</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="item in items" :key="item.id">
					<td class="line-items__col-desc">
						{{ item.description }}
						<span v-if="item.unit" class="line-items__unit">/ {{ item.unit }}</span>
					</td>
					<td class="line-items__col-num">{{ item.quantity ?? '' }}</td>
					<td class="line-items__col-num">{{ item.rate != null ? fmt.format(item.rate) : '' }}</td>
					<td class="line-items__col-num">{{ fmt.format(lineAmount(item)) }}</td>
				</tr>
			</tbody>
			<tfoot v-if="showTotals">
				<tr v-if="hasAdjustments" class="line-items__subtotal">
					<td colspan="3">Subtotal</td>
					<td class="line-items__col-num">{{ fmt.format(subtotal) }}</td>
				</tr>
				<tr v-if="discount" class="line-items__subtotal">
					<td colspan="3">Discount</td>
					<td class="line-items__col-num">−{{ fmt.format(discount) }}</td>
				</tr>
				<tr v-if="taxRate" class="line-items__subtotal">
					<td colspan="3">Tax ({{ taxRate }}%)</td>
					<td class="line-items__col-num">{{ fmt.format(taxAmount) }}</td>
				</tr>
				<tr class="line-items__total">
					<td colspan="3">Total</td>
					<td class="line-items__col-num">{{ fmt.format(total) }}</td>
				</tr>
			</tfoot>
		</table>
		<p v-if="payload?.note" class="line-items__note">{{ payload.note }}</p>
	</div>
</template>

<style scoped>
.line-items__heading {
	font-size: 1.3rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin-bottom: 0.75rem;
}
.line-items__table {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.9rem;
}
.line-items__table th {
	text-align: left;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	font-size: 0.68rem;
	font-weight: 600;
	opacity: 0.6;
	padding: 0.4rem 0.5rem;
	border-bottom: 2px solid var(--doc-accent, hsl(var(--primary)));
}
.line-items__table td {
	padding: 0.5rem 0.5rem;
	border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	vertical-align: top;
}
.line-items__col-num {
	text-align: right;
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
}
.line-items__unit {
	opacity: 0.5;
	font-size: 0.8em;
}
.line-items__subtotal td {
	border-bottom: none;
	padding-top: 0.25rem;
	padding-bottom: 0.25rem;
	opacity: 0.7;
	font-size: 0.85rem;
}
.line-items__total td {
	border-top: 2px solid var(--doc-accent, hsl(var(--primary)));
	border-bottom: none;
	font-weight: 800;
	font-size: 1rem;
	padding-top: 0.5rem;
}
.line-items__total td:last-child { color: var(--doc-accent, hsl(var(--primary))); }
.line-items__note {
	margin-top: 0.75rem;
	font-size: 0.8rem;
	opacity: 0.65;
}

:global(.dark .line-items__table td) { border-bottom-color: rgba(255, 255, 255, 0.1); }
</style>
