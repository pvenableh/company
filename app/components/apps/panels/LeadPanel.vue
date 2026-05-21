<!--
  LeadPanel — slide-over body for a single lead.

  Wraps the shared `<AppsClientsLeadWorkspace>` in `compact` mode inside
  `AppSlideOverShell` so the panel renders the same workspace as
  `/leads/[id]` without a full-route navigation.
-->
<script setup lang="ts">
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: 'close'): void }>();

const lead = ref<any | null>(null);

function onLoaded(l: any) {
  lead.value = l;
}

const title = computed(() => {
  const c = lead.value?.related_contact;
  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : '';
  return name || c?.company || 'Lead';
});
const subtitle = computed(() => {
  const c = lead.value?.related_contact;
  if (!c) return null;
  return c.company || c.email || null;
});

const stageLabel = computed(() => (lead.value as any)?.stage || null);
const score = computed(() => {
  const s = (lead.value as any)?.lead_score;
  return typeof s === 'number' ? `${s}/100` : null;
});
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
            {{ title }}
          </p>
          <p v-if="subtitle || score" class="text-[11px] text-muted-foreground truncate mt-0.5">
            {{ [subtitle, score ? `Score ${score}` : null].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <span
          v-if="stageLabel"
          class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider shrink-0"
        >
          {{ stageLabel }}
        </span>
      </div>
    </template>
    <template #actions>
      <NuxtLink
        :to="`/leads/${id}`"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title="Open the lead as a full page"
      >
        <Icon name="lucide:external-link" class="w-3 h-3" />
        Full Page
      </NuxtLink>
    </template>

    <AppsClientsLeadWorkspace
      :lead-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
