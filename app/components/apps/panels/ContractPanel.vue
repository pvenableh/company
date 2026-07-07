<!--
  ContractPanel — slide-over body for a single contract.

  Wraps the shared `<AppsDocumentsContractWorkspace>` in `compact` mode
  inside `AppSlideOverShell` so the panel renders the same workspace as
  `/contracts/[id]` without a full-route navigation. Reads the panel
  registry's `id` prop as the contractId.
-->
<script setup lang="ts">
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: 'close'): void }>();

const contract = ref<any | null>(null);
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

function onLoaded(c: any) {
  contract.value = c;
  // Register contract context so Earnest is aware of what you're viewing.
  setEntity('contract', String(c.id), c.title || 'Contract');
}

const title = computed(() => contract.value?.title || 'Contract');
const subtitle = computed(() => {
  const o = contract.value?.organization?.name;
  const c = contract.value?.contact;
  const contactName = c
    ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null
    : null;
  return contactName ? `${o ? o + ' · ' : ''}${contactName}` : (o || null);
});

const fullPageHref = computed(() => {
  const id = contract.value?.id || props.id;
  return props.mode === 'edit' ? `/contracts/${id}?edit=1` : `/contracts/${id}`;
});

const statusLabel = computed(() => (contract.value as any)?.contract_status || null);
const clientName = computed(() => (contract.value as any)?.client?.name || null);

onBeforeUnmount(() => {
  if (entityId.value === String(props.id)) resetEntityContext();
});
</script>

<template>
  <AppSlideOverShell
    :title="title"
    :subtitle="subtitle"
    :flip-from="flipFrom"
    @close="$emit('close')"
  >
    <template #actions>
      <NuxtLink
        :to="fullPageHref"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        :title="`Open full page for ${title}`"
      >
        <Icon name="lucide:external-link" class="w-3 h-3" />
        Full Page
      </NuxtLink>
    </template>

    <template #hero>
      <div class="flex items-center justify-between gap-3 px-1 py-1.5">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground truncate">
            {{ contract?.title || 'Contract' }}
          </p>
          <p v-if="clientName" class="text-[11px] text-muted-foreground truncate mt-0.5">
            {{ clientName }}
          </p>
        </div>
        <span
          v-if="statusLabel"
          class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider shrink-0"
        >
          {{ statusLabel }}
        </span>
      </div>
    </template>

    <AppsDocumentsContractWorkspace
      :contract-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
