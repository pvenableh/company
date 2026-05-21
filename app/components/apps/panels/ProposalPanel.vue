<!--
  ProposalPanel — slide-over body for a single proposal.

  Wraps the shared `<AppsDocumentsProposalWorkspace>` in `compact` mode
  inside `AppSlideOverShell` so the panel renders the same workspace as
  `/proposals/[id]` without a full-route navigation.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string }>();
defineEmits<{ (e: 'close'): void }>();

const proposal = ref<any | null>(null);

function onLoaded(p: any) {
  proposal.value = p;
}

const title = computed(() => proposal.value?.title || 'Proposal');
const subtitle = computed(() => {
  const o = proposal.value?.organization?.name;
  const c = proposal.value?.contact;
  const contactName = c
    ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null
    : null;
  return contactName ? `${o ? o + ' · ' : ''}${contactName}` : (o || null);
});

const fullPageHref = computed(() => {
  const id = proposal.value?.id || props.id;
  return props.mode === 'edit' ? `/proposals/${id}?edit=1` : `/proposals/${id}`;
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

    <AppsDocumentsProposalWorkspace
      :proposal-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
