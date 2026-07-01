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
    <template v-if="invoice" #actions>
      <NuxtLink
        :to="`/invoices/detail/${id}`"
        class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
        :title="`Open full page for ${title}`"
      >
        <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
        Open Invoice
      </NuxtLink>
    </template>

    <AppsMoneyInvoiceWorkspace
      :invoice-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
