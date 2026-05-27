<!--
  InvoicePanel — slide-over body for an invoice.

  Wraps the shared `<AppsMoneyInvoiceWorkspace>` in `compact` mode inside
  `AppSlideOverShell` so the panel renders the same workspace as
  `/invoices/detail/[id]` without a full-route navigation. Reads the
  panel registry's `id` prop as the invoiceId.
-->
<script setup lang="ts">
import type { Invoice } from '~~/shared/directus';
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string; mode?: string }>();
defineEmits<{ (e: 'close'): void }>();

const invoice = ref<Invoice | null>(null);

function onLoaded(inv: Invoice) {
  invoice.value = inv;
}

const title = computed(() => invoice.value?.invoice_code || 'Invoice');
const subtitle = computed(() => {
  const c = invoice.value?.client;
  if (!c || typeof c === 'string') return null;
  return (c as any).name || null;
});
</script>

<template>
  <AppSlideOverShell
    :title="title"
    :subtitle="subtitle"
    @close="$emit('close')"
  >
    <AppsMoneyInvoiceWorkspace
      :invoice-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
