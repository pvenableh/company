<!--
  MailingListPanel — slide-over body for a single mailing list.

  Wraps the shared `<AppsListsMailingListWorkspace>` in `compact` mode
  inside `AppSlideOverShell` so the panel renders the same workspace as
  `/lists/[id]` without a full-route navigation.
-->
<script setup lang="ts">
import type { MailingList } from '~~/shared/email/contacts';
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: 'close'): void }>();

const list = ref<MailingList | null>(null);
const workspaceRef = ref<{ openEdit: () => void } | null>(null);
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

function onLoaded(l: MailingList) {
  list.value = l;
  if (l?.id) setEntity('list', String(l.id), l.name || 'List');
}

const title = computed(() => list.value?.name || 'Mailing List');
const subscriberCount = computed(() => Number((list.value as any)?.subscriber_count ?? 0));
const subtitle = computed(() => {
  if (!list.value) return null;
  return `${subscriberCount.value} active subscriber${subscriberCount.value === 1 ? '' : 's'}`;
});

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
    <template #hero>
      <div class="flex items-center justify-between gap-3 px-1 py-1.5">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground truncate">
            {{ list?.name || 'Mailing list' }}
          </p>
          <p v-if="list" class="text-[11px] text-muted-foreground truncate mt-0.5">
            {{ subscriberCount }} subscriber{{ subscriberCount === 1 ? '' : 's' }}
          </p>
        </div>
        <span
          v-if="(list as any)?.default"
          class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider shrink-0"
        >
          Default
        </span>
      </div>
    </template>

    <template v-if="list" #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        @click="workspaceRef?.openEdit()"
      >
        <Icon name="lucide:pencil" class="w-3 h-3" />
        Edit
      </button>
      <NuxtLink
        :to="`/lists/${list.id}`"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        :title="`Open full page for ${list.name}`"
      >
        <Icon name="lucide:external-link" class="w-3 h-3" />
        Full Page
      </NuxtLink>
    </template>

    <AppsListsMailingListWorkspace
      ref="workspaceRef"
      :list-id="id"
      compact
      @loaded="onLoaded"
      @close="$emit('close')"
    />
  </AppSlideOverShell>
</template>
