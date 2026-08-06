<!--
  RetainerInvoiceModal — generate an invoice for a project's retainer period.
  Bills the flat period fee (retainer_hours_per_period × retainer_hourly_rate)
  and, when the period is over-burned, offers an overage line for the extra
  hours at the same rate. The user reviews the computed lines, then it creates
  the invoice via useInvoices().createInvoice and opens it for a final look.
-->
<script setup lang="ts">
import type { Project } from '~~/shared/directus';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{
  project: Project | null | undefined;
  hoursUsed: number;
  hoursAllocated: number;
  periodLabel: string;
}>();

const { createInvoice, generateInvoiceCode } = useInvoices();
const invoiceSlide = useAppSlideOver('invoice');
const toast = useToast();

const p = computed<any>(() => props.project || {});
const clientId = computed<string | null>(() => (p.value.client?.id ?? p.value.client) || null);
const orgId = computed<string | null>(() => (p.value.organization?.id ?? p.value.organization) || null);
const rate = computed(() => Number(p.value.retainer_hourly_rate) || 0);
const hoursPerPeriod = computed(() => Number(p.value.retainer_hours_per_period) || 0);
const overageHours = computed(() => Math.max(0, Math.round((props.hoursUsed - props.hoursAllocated) * 10) / 10));

const includeOverage = ref(false);
const dueInDays = ref(30);
watch(open, (v) => { if (v) { includeOverage.value = overageHours.value > 0; generating.value = false; error.value = null; } });

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const lines = computed(() => {
  const out: { description: string; quantity: number; rate: number; amount: number }[] = [];
  const base = hoursPerPeriod.value * rate.value;
  out.push({
    description: `Retainer — ${props.periodLabel} (${hoursPerPeriod.value}h @ ${money(rate.value)}/h)`,
    quantity: hoursPerPeriod.value, rate: rate.value, amount: Math.round(base * 100) / 100,
  });
  if (includeOverage.value && overageHours.value > 0) {
    out.push({
      description: `Overage — ${overageHours.value}h beyond the ${hoursPerPeriod.value}h allocation`,
      quantity: overageHours.value, rate: rate.value, amount: Math.round(overageHours.value * rate.value * 100) / 100,
    });
  }
  return out;
});
const total = computed(() => lines.value.reduce((s, l) => s + l.amount, 0));

const generating = ref(false);
const error = ref<string | null>(null);

async function generate() {
  if (!clientId.value) { error.value = 'This project has no client — set one before invoicing.'; return; }
  if (!rate.value || !hoursPerPeriod.value) { error.value = 'Set the retainer hours and rate on the project first.'; return; }
  error.value = null;
  generating.value = true;
  try {
    const today = new Date();
    const due = new Date(today.getTime() + dueInDays.value * 86400000);
    const invoiceDate = today.toISOString().slice(0, 10);
    let code: string | null = null;
    try { code = await generateInvoiceCode(clientId.value, invoiceDate, orgId.value || undefined); } catch { /* optional */ }

    const created: any = await createInvoice({
      client: clientId.value,
      invoice_date: invoiceDate,
      due_date: due.toISOString().slice(0, 10),
      invoice_code: code,
      status: 'pending',
      total_amount: Math.round(total.value * 100) / 100,
      memo: `Retainer invoice — ${p.value.title || 'project'} · ${props.periodLabel}`,
      projects: [{ projects_id: p.value.id }],
      line_items: { create: lines.value.map((l) => ({ description: l.description, quantity: l.quantity, rate: l.rate, amount: l.amount, product: null, status: 'published' })) },
    });
    open.value = false;
    toast.add({ title: 'Retainer invoice created', description: code || undefined, color: 'green' });
    if (created?.id) invoiceSlide.open(String(created.id));
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Could not create the invoice.';
  } finally {
    generating.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" @click.self="open = false">
    <div class="my-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
      <div class="flex items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <div class="flex items-center gap-2">
            <Icon name="lucide:receipt" class="h-4 w-4 text-primary" />
            <h3 class="text-sm font-semibold text-foreground">Bill this retainer period</h3>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ periodLabel }} · {{ p.title || 'Project' }}</p>
        </div>
        <button class="rounded-full p-1.5 text-muted-foreground hover:bg-muted" @click="open = false"><Icon name="lucide:x" class="h-4 w-4" /></button>
      </div>

      <div class="p-5">
        <!-- Line preview -->
        <div class="rounded-xl border border-border overflow-hidden">
          <div v-for="(l, i) in lines" :key="i" class="flex items-start justify-between gap-3 px-4 py-3 border-b border-border last:border-0">
            <div class="min-w-0">
              <p class="text-[13px] font-medium truncate">{{ l.description }}</p>
              <p class="text-[11px] text-muted-foreground tabular-nums">{{ l.quantity }} × {{ money(l.rate) }}</p>
            </div>
            <span class="text-[13px] font-semibold tabular-nums shrink-0">{{ money(l.amount) }}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-3 bg-muted/30">
            <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
            <span class="text-sm font-bold tabular-nums">{{ money(total) }}</span>
          </div>
        </div>

        <label v-if="overageHours > 0" class="mt-4 flex items-center gap-2 text-sm">
          <input v-model="includeOverage" type="checkbox" class="rounded border-border">
          <span>Include overage — <strong>{{ overageHours }}h</strong> over allocation at {{ money(rate) }}/h</span>
        </label>

        <label class="mt-4 grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due in</span>
          <select v-model.number="dueInDays" class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none">
            <option :value="0">On receipt</option>
            <option :value="15">15 days</option>
            <option :value="30">30 days</option>
            <option :value="45">45 days</option>
          </select>
        </label>

        <p v-if="error" class="mt-3 text-sm text-rose-500">{{ error }}</p>

        <div class="mt-5 flex items-center gap-3">
          <button :disabled="generating" class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60" @click="generate">
            <Icon :name="generating ? 'lucide:loader-2' : 'lucide:receipt'" :class="['h-4 w-4', generating && 'animate-spin']" />
            {{ generating ? 'Creating…' : `Create invoice · ${money(total)}` }}
          </button>
          <button class="text-sm text-muted-foreground hover:text-foreground" @click="open = false">Cancel</button>
        </div>
        <p class="mt-3 text-[11px] text-muted-foreground">Creates a draft (pending) invoice you can review and send from Money.</p>
      </div>
    </div>
  </div>
</template>
