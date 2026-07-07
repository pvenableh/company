<!--
  ClientRatingBadge — the A–F client rating as a small colored badge with a
  hover breakdown. Drop-in anywhere a client id is available:

    <ClientsClientRatingBadge :client-id="client.id" />

  It auto-loads the org's batch scores (deduped across every badge), so callers
  don't have to remember to prime the data. Pass an explicit `score` object to
  skip the lookup. Renders nothing until the score is known.
-->
<script setup lang="ts">
const props = defineProps<{
  clientId?: string | null;
  score?: any | null;
  size?: 'xs' | 'sm' | 'md';
  label?: boolean;
  /** Render the score breakdown inline next to the badge instead of on hover. */
  detailed?: boolean;
}>();

const { selectedOrg } = useOrganization();
const { getScore, load } = useClientScores();

onMounted(() => { if (!props.score) load(selectedOrg.value); });
watch(selectedOrg, (org) => { if (!props.score) load(org); });

const resolved = computed(() => props.score ?? getScore(props.clientId));

const fmt = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
function ratingClass(r: string): string {
  return {
    A: 'bg-green-500/15 text-green-600', B: 'bg-green-500/10 text-green-600',
    C: 'bg-amber-500/15 text-amber-600', D: 'bg-red-500/10 text-red-600', F: 'bg-red-500/20 text-red-600',
  }[r] || 'bg-muted text-muted-foreground';
}
function meaning(r: string): string {
  return {
    A: 'Strong account — protect it', B: 'Healthy account', C: 'Mixed — keep an eye on it',
    D: 'At risk — needs attention', F: 'Problem account',
  }[r] || '';
}
const sizeCls = computed(() =>
  props.size === 'xs' ? 'w-5 h-5 text-[10px]' : props.size === 'md' ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs',
);
const tip = computed(() => {
  const s = resolved.value;
  if (!s) return '';
  const parts = [`Rating ${s.rating} — ${meaning(s.rating)}`, `${fmt(s.revenue)} revenue`, `${s.effort} touch-point${s.effort === 1 ? '' : 's'}`];
  if (s.overdueAR > 0) parts.push(`${fmt(s.overdueAR)} overdue`);
  if (s.staleDays != null && s.staleDays > 60) parts.push(`quiet ${s.staleDays}d`);
  return parts.join(' · ');
});
</script>

<template>
  <!-- Detailed: badge + meaning + the score breakdown inline (no hover needed). -->
  <div v-if="resolved && detailed" class="inline-flex items-center gap-2 flex-wrap align-middle">
    <span :class="[ratingClass(resolved.rating), sizeCls]" class="rounded-full flex items-center justify-center font-bold shrink-0">
      {{ resolved.rating }}
    </span>
    <span class="text-[11px] font-medium text-foreground">{{ meaning(resolved.rating) }}</span>
    <span class="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span class="inline-flex items-center gap-0.5"><Icon name="lucide:banknote" class="w-3 h-3" />{{ fmt(resolved.revenue) }}</span>
      <span class="opacity-40">·</span>
      <span class="inline-flex items-center gap-0.5"><Icon name="lucide:activity" class="w-3 h-3" />{{ resolved.effort }} touch-point{{ resolved.effort === 1 ? '' : 's' }}</span>
      <template v-if="resolved.overdueAR > 0">
        <span class="opacity-40">·</span>
        <span class="inline-flex items-center gap-0.5 text-red-600"><Icon name="lucide:alert-circle" class="w-3 h-3" />{{ fmt(resolved.overdueAR) }} overdue</span>
      </template>
      <template v-if="resolved.staleDays != null && resolved.staleDays > 60">
        <span class="opacity-40">·</span>
        <span class="inline-flex items-center gap-0.5"><Icon name="lucide:clock" class="w-3 h-3" />quiet {{ resolved.staleDays }}d</span>
      </template>
    </span>
  </div>

  <UTooltip v-else-if="resolved" :text="tip">
    <span class="inline-flex items-center gap-1 align-middle">
      <span :class="[ratingClass(resolved.rating), sizeCls]" class="rounded-full flex items-center justify-center font-bold shrink-0">
        {{ resolved.rating }}
      </span>
      <span v-if="label" class="text-[10px] uppercase tracking-wider text-muted-foreground">rating</span>
    </span>
  </UTooltip>
</template>
