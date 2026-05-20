<script setup lang="ts">
/**
 * SocialInboxSurface — body of the legacy /social/inbox page, extracted
 * for Studio's `?view=inbox` sub-view. Unified DMs, replies, mentions
 * across Facebook / Instagram / Threads.
 */
import { Button } from '~/components/ui/button';

const {
  platformFilter,
  archived,
  selectedThreadId,
  threads,
  threadsLoading,
  selectedThread,
  messages,
  threadLoading,
  selectThread,
  send,
  setArchived,
} = useSocialInbox();

const toast = useToast();

async function onSend(text: string) {
  if (!selectedThreadId.value) return;
  try {
    await send(selectedThreadId.value, { text });
  } catch (err: any) {
    toast.add({
      title: 'Send failed',
      description: err?.data?.message || err?.message || 'Could not deliver reply',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  }
}

async function onArchive(value: boolean) {
  if (!selectedThreadId.value) return;
  await setArchived(selectedThreadId.value, value);
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3 gap-2">
      <p class="text-xs text-muted-foreground">DMs, replies, and mentions across Facebook, Instagram, and Threads.</p>
      <Button
        :variant="archived ? 'secondary' : 'ghost'"
        size="sm"
        @click="archived = !archived"
      >
        <Icon name="lucide:archive" class="w-4 h-4 mr-1" />
        {{ archived ? 'Showing archived' : 'Active only' }}
      </Button>
    </div>

    <div class="grid h-[calc(100vh-240px)] grid-cols-12 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div class="col-span-12 md:col-span-4 lg:col-span-3">
        <InboxThreadList
          :threads="threads"
          :selected-id="selectedThreadId"
          :loading="threadsLoading"
          :platform-filter="platformFilter"
          @select="selectThread"
          @update:platform-filter="(v) => (platformFilter = v)"
        />
      </div>
      <div class="col-span-12 md:col-span-8 lg:col-span-9">
        <InboxThreadView
          :thread="selectedThread"
          :messages="messages"
          :loading="threadLoading"
          @send="onSend"
          @archive="onArchive"
        />
      </div>
    </div>
  </div>
</template>
