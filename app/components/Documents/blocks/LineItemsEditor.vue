<script setup lang="ts">
/**
 * line_items — an itemized table editor (description, qty, rate → amount)
 * with optional tax / discount and a live total. Amount auto-computes from
 * qty × rate unless the user types an explicit override.
 */
import type { LineItemsPayload, LineItem } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: LineItemsPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: LineItemsPayload];
}>();

function uid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `li_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const payload = computed<LineItemsPayload>(() => ({
	heading: props.modelValue?.heading ?? '',
	currency: props.modelValue?.currency || 'USD',
	items: Array.isArray(props.modelValue?.items) ? props.modelValue.items : [],
	show_totals: props.modelValue?.show_totals !== false,
	tax_rate: props.modelValue?.tax_rate ?? null,
	discount: props.modelValue?.discount ?? null,
	note: props.modelValue?.note ?? '',
}));

function patch(p: Partial<LineItemsPayload>) {
	emit('update:modelValue', { ...payload.value, ...p });
}
function setItems(items: LineItem[]) {
	patch({ items });
}
function addItem() {
	setItems([...payload.value.items, { id: uid(), description: '', quantity: 1, unit: '', rate: null, amount: null }]);
}
function removeItem(i: number) {
	setItems(payload.value.items.filter((_, idx) => idx !== i));
}
function updateItem(i: number, p: Partial<LineItem>) {
	setItems(payload.value.items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
}
function num(v: string): number | null {
	return v === '' ? null : Number(v);
}

function lineAmount(it: LineItem): number {
	if (it.amount != null) return it.amount;
	return (it.quantity ?? 0) * (it.rate ?? 0);
}
const subtotal = computed(() => payload.value.items.reduce((s, it) => s + lineAmount(it), 0));
const taxAmount = computed(() => (payload.value.tax_rate ? subtotal.value * (payload.value.tax_rate / 100) : 0));
const total = computed(() => subtotal.value - (payload.value.discount || 0) + taxAmount.value);

const fmt = computed(() => {
	const currency = payload.value.currency || 'USD';
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency });
	} catch {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
	}
});
</script>

<template>
	<div class="space-y-2">
		<div class="flex items-center gap-2">
			<input
				:value="payload.heading || ''"
				placeholder="Heading (optional) — e.g. Line items"
				class="flex-1 bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
				@input="patch({ heading: ($event.target as HTMLInputElement).value })"
			/>
			<input
				:value="payload.currency || 'USD'"
				placeholder="USD"
				maxlength="3"
				class="w-16 bg-transparent border-b border-border outline-none text-xs uppercase text-center py-1"
				@input="patch({ currency: ($event.target as HTMLInputElement).value.toUpperCase() })"
			/>
		</div>

		<div class="rounded-lg border border-border overflow-hidden">
			<div class="grid grid-cols-[1fr_3rem_5rem_5rem_1.5rem] gap-2 px-2 py-1.5 bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
				<span>Description</span>
				<span class="text-right">Qty</span>
				<span class="text-right">Rate</span>
				<span class="text-right">Amount</span>
				<span></span>
			</div>
			<div
				v-for="(item, i) in payload.items"
				:key="item.id"
				class="grid grid-cols-[1fr_3rem_5rem_5rem_1.5rem] gap-2 px-2 py-1 items-center border-t border-border/50 group/row"
			>
				<input
					:value="item.description"
					placeholder="Item description"
					class="bg-transparent border-0 outline-none text-sm"
					@input="updateItem(i, { description: ($event.target as HTMLInputElement).value })"
				/>
				<input
					type="number"
					:value="item.quantity ?? ''"
					placeholder="1"
					class="bg-transparent border-0 outline-none text-sm text-right"
					@input="updateItem(i, { quantity: num(($event.target as HTMLInputElement).value) })"
				/>
				<input
					type="number"
					:value="item.rate ?? ''"
					placeholder="0"
					class="bg-transparent border-0 outline-none text-sm text-right"
					@input="updateItem(i, { rate: num(($event.target as HTMLInputElement).value) })"
				/>
				<span class="text-sm text-right tabular-nums">{{ fmt.format(lineAmount(item)) }}</span>
				<button class="p-0.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover/row:opacity-100" @click="removeItem(i)">
					<EIcon name="lucide:x" class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>

		<button class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="addItem">
			<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add line item
		</button>

		<div class="flex flex-wrap items-center gap-3 pt-1">
			<label class="text-[11px] text-muted-foreground inline-flex items-center gap-1">
				Tax %
				<input
					type="number"
					:value="payload.tax_rate ?? ''"
					placeholder="—"
					class="w-16 bg-transparent border-b border-border outline-none text-sm py-0.5"
					@input="patch({ tax_rate: num(($event.target as HTMLInputElement).value) })"
				/>
			</label>
			<label class="text-[11px] text-muted-foreground inline-flex items-center gap-1">
				Discount
				<input
					type="number"
					:value="payload.discount ?? ''"
					placeholder="—"
					class="w-20 bg-transparent border-b border-border outline-none text-sm py-0.5"
					@input="patch({ discount: num(($event.target as HTMLInputElement).value) })"
				/>
			</label>
			<label class="text-[11px] text-muted-foreground inline-flex items-center gap-1 ml-auto">
				<input type="checkbox" :checked="payload.show_totals !== false" @change="patch({ show_totals: ($event.target as HTMLInputElement).checked })" />
				Show totals
			</label>
		</div>

		<div v-if="payload.show_totals !== false" class="text-right text-sm border-t border-border pt-1.5">
			<span class="text-muted-foreground">Total: </span>
			<span class="font-bold tabular-nums">{{ fmt.format(total) }}</span>
		</div>

		<textarea
			:value="payload.note || ''"
			placeholder="Note (optional) — e.g. payment terms"
			rows="1"
			class="w-full bg-transparent border-0 outline-none resize-y text-xs text-muted-foreground"
			@input="patch({ note: ($event.target as HTMLTextAreaElement).value })"
		/>
	</div>
</template>
