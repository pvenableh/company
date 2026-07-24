<!--
  PriorityActionInvoicePaid — inline "Mark paid" quick-action for invoice cards
  in the Command Center Priority Actions widget. Mirrors the ticket/task
  quick-status pill, but instead of a status dropdown it records a full manual
  payment against the invoice (the supported mutation) via
  POST /api/invoices/:id/payments, which sets the invoice status to `paid`.
-->
<script setup lang="ts">
const props = defineProps<{ id: string; amount?: number | null }>();
const emit = defineEmits<{ (e: 'paid'): void }>();

const saving = ref(false);
const toast = useToast();
const { awardEvent } = useArcadeAwards();

async function markPaid() {
	if (saving.value) return;
	saving.value = true;
	try {
		await $fetch(`/api/invoices/${props.id}/payments`, {
			method: 'POST',
			body: {
				// Record the full invoice amount as an offline ("other") payment.
				amount: Number(props.amount) || undefined,
				payment_method: 'other',
				note: 'Marked paid from Command Center',
			},
		});
		// Arcade reward — getting paid is a money moment. Mirrors InvoiceWorkspace.
		awardEvent('invoice_paid_on_time', { amount: Number(props.amount) || undefined });
		emit('paid');
	} catch (err: any) {
		console.error('[PriorityActionInvoicePaid] mark paid failed:', err);
		toast.add({
			title: 'Could not mark paid',
			description: err?.data?.message || err?.message || 'Please try from the invoice.',
			icon: 'i-lucide-alert-circle',
			color: 'red',
		});
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<button
		type="button"
		class="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-2 py-1 text-[10px] font-medium text-foreground/80 hover:text-foreground hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
		:disabled="saving"
		@click.stop="markPaid"
	>
		<EIcon v-if="saving" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
		<EIcon v-else name="i-lucide-check-circle-2" class="w-3 h-3 text-emerald-600" />
		<span class="whitespace-nowrap">Mark paid</span>
	</button>
</template>
