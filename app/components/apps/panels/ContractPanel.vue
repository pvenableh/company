<!--
  ContractPanel — slide-over body for a single contract.

  Wraps the shared `<AppsDocumentsContractWorkspace>` in `compact` mode
  inside `AppSlideOverShell` so the panel renders the same workspace as
  `/contracts/[id]` without a full-route navigation. Reads the panel
  registry's `id` prop as the contractId.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string }>();
defineEmits<{ (e: 'close'): void }>();

const contract = ref<any | null>(null);

function onLoaded(c: any) {
  contract.value = c;
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
</script>

<template>
  <AppSlideOverShell :title="title" :subtitle="subtitle" @close="$emit('close')">
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

    <AppsDocumentsContractWorkspace
      :contract-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
