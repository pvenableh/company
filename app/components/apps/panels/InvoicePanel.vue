<!--
  InvoicePanel — slide-over body for an invoice.

  Wraps the shared `<AppsMoneyInvoiceWorkspace>` in `compact` mode inside
  `AppSlideOverShell` so the panel renders the same workspace as
  `/invoices/detail/[id]` without a full-route navigation. Reads the
  panel registry's `id` prop as the invoiceId.

  FLIP entry — when opened via `useAppSlideOver('invoice').open(id, { flipFrom })`,
  AppSlideOverShell flies the row clone into the `#hero` slot. The hero
  renders immediately with placeholder copy so the FLIP has a measurable
  target before the workspace's `@loaded` fires.
-->
<script setup lang="ts">
import type { Invoice } from '~~/shared/directus';
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: 'close'): void }>();

const invoice = ref<Invoice | null>(null);

function onLoaded(inv: Invoice) {
  invoice.value = inv;
}

const title = computed(() => invoice.value?.invoice_code || 'Invoice');
const clientName = computed(() => {
  const c = invoice.value?.client;
  if (!c) return null;
  if (typeof c === 'string') return null;
  return (c as any).name || null;
});
const subtitle = computed(() => clientName.value);
const status = computed(() => (invoice.value as any)?.invoice_status || null);
</script>

<template>
  <AppSlideOverShell
    :title="title"
    :subtitle="subtitle"
    :flip-from="flipFrom"
    @close="$emit('close')"
  >

    <template #hero>
      <div class="flex items-center justify-between gap-3 px-1 py-1.5">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground truncate">
            {{ invoice?.invoice_code || 'Invoice' }}
          </p>
          <p v-if="clientName" class="text-[11px] text-muted-foreground truncate mt-0.5">
            {{ clientName }}
          </p>
        </div>
        <span
          v-if="status"
          class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider shrink-0"
        >
          {{ status }}
        </span>
      </div>
    </template>

    <AppsMoneyInvoiceWorkspace
      :invoice-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
