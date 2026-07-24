<script setup lang="ts">
/*
  PipelineForecast — the cash-side mirror of the sales pipeline.

  The editable pursuit board now lives in People (/apps/clients?view=pipeline).
  Money stays about actuals + forecast, so this floor is READ-ONLY: a rollup of
  open proposal value ("what's in flight"), broken down by stage, with each row
  deep-linking back to the owning client/lead so the relationship stays owned by
  People. Nothing is edited here — the CTA sends you to People to work it.
*/
const { selectedOrg } = useOrganization();
const proposalItems = useDirectusItems('proposals');
const clientSlide = useAppSlideOver('client');
const leadSlide = useAppSlideOver('lead');
const proposalSlide = useAppSlideOver('proposal');

// "In flight" = still being pursued (accepted/rejected/expired are settled).
const OPEN_STATUSES = ['draft', 'sent', 'viewed'];

const rows = ref<any[]>([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const filter: any = { _and: [{ proposal_status: { _in: OPEN_STATUSES } }] };
    if (selectedOrg.value) filter._and.push({ organization: { _eq: selectedOrg.value } });
    rows.value = (await proposalItems.list({
      fields: [
        'id', 'title', 'total_value', 'proposal_status', 'date_sent', 'valid_until',
        'client.id', 'client.name',
        'lead.id', 'lead.related_contact.first_name', 'lead.related_contact.last_name',
        'contact.first_name', 'contact.last_name',
      ],
      filter,
      sort: ['-total_value'],
      limit: -1,
    }).catch(() => [])) as any[];
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(selectedOrg, load);

const totalValue = computed(() => rows.value.reduce((s, r) => s + (Number(r.total_value) || 0), 0));

const STAGES = [
  { key: 'draft', label: 'Draft', tone: 'text-muted-foreground', dot: 'bg-muted-foreground/50' },
  { key: 'sent', label: 'Sent', tone: 'text-primary', dot: 'bg-primary' },
  { key: 'viewed', label: 'Viewed', tone: 'text-violet-500 dark:text-violet-400', dot: 'bg-violet-500' },
];
const byStage = computed(() =>
  STAGES.map((s) => {
    const items = rows.value.filter((r) => r.proposal_status === s.key);
    return { ...s, count: items.length, value: items.reduce((a, b) => a + (Number(b.total_value) || 0), 0) };
  }),
);

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

function ownerLabel(r: any) {
  if (r.client?.name) return r.client.name;
  const lc = r.lead?.related_contact;
  if (lc) return [lc.first_name, lc.last_name].filter(Boolean).join(' ').trim() || 'Lead';
  if (r.contact) return [r.contact.first_name, r.contact.last_name].filter(Boolean).join(' ').trim() || 'Contact';
  return '—';
}
function ownerKind(r: any) {
  if (r.client?.id) return 'Client';
  if (r.lead?.id) return 'Lead';
  return 'Proposal';
}
function openOwner(r: any) {
  if (r.client?.id) clientSlide.open(String(r.client.id));
  else if (r.lead?.id) leadSlide.open(String(r.lead.id));
  else proposalSlide.open(String(r.id));
}

const stageMeta: Record<string, { tone: string; dot: string; label: string }> = Object.fromEntries(
  STAGES.map((s) => [s.key, s]),
);
</script>

<template>
  <div class="space-y-6">
    <!-- Forecast header: total in flight + link to work it in People. -->
    <div class="ios-card p-5 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Value in flight</p>
        <p class="text-3xl font-bold text-foreground mt-1">{{ fmt(totalValue) }}</p>
        <p class="text-xs text-muted-foreground mt-1">
          {{ rows.length }} open {{ rows.length === 1 ? 'proposal' : 'proposals' }} · forecast only, not billed
        </p>
      </div>
      <NuxtLink
        to="/apps/clients?view=pipeline"
        class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-xs font-medium hover:bg-muted transition-colors"
      >
        <Icon name="lucide:target" class="w-3.5 h-3.5" />
        Manage pipeline in People
        <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
      </NuxtLink>
    </div>

    <!-- Stage breakdown (read-only). -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div v-for="s in byStage" :key="s.key" class="ios-card p-4">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full" :class="s.dot" />
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ s.label }}</p>
        </div>
        <p class="text-xl font-bold text-foreground mt-1">{{ fmt(s.value) }}</p>
        <p class="text-xs text-muted-foreground">{{ s.count }} {{ s.count === 1 ? 'proposal' : 'proposals' }}</p>
      </div>
    </div>

    <!-- Linked list — each row jumps to the owning client/lead in People. -->
    <div class="ios-card overflow-hidden">
      <div class="px-5 py-3 border-b border-border/60 flex items-center justify-between">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Open proposals</p>
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Highest value first</p>
      </div>

      <div v-if="loading" class="p-6 space-y-3">
        <div v-for="n in 4" :key="n" class="h-10 rounded-lg bg-muted animate-pulse" />
      </div>

      <div v-else-if="!rows.length" class="p-10 text-center">
        <Icon name="lucide:target" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">Nothing in flight right now.</p>
        <NuxtLink to="/apps/clients?view=pipeline" class="text-xs text-primary hover:underline mt-1 inline-block">
          Open the pipeline in People →
        </NuxtLink>
      </div>

      <ul v-else class="divide-y divide-border/60">
        <li
          v-for="r in rows"
          :key="r.id"
          class="group flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
          role="button"
          tabindex="0"
          @click="openOwner(r)"
          @keydown.enter="openOwner(r)"
        >
          <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="stageMeta[r.proposal_status]?.dot || 'bg-muted-foreground/50'" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
              {{ r.title || 'Untitled proposal' }}
            </p>
            <p class="text-xs text-muted-foreground truncate">
              <span class="uppercase tracking-wider text-[10px]">{{ ownerKind(r) }}</span>
              · {{ ownerLabel(r) }}
            </p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-sm font-semibold text-foreground">{{ fmt(Number(r.total_value) || 0) }}</p>
            <p class="text-[10px] uppercase tracking-wider" :class="stageMeta[r.proposal_status]?.tone || 'text-muted-foreground'">
              {{ stageMeta[r.proposal_status]?.label || r.proposal_status }}
            </p>
          </div>
          <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </li>
      </ul>
    </div>
  </div>
</template>
