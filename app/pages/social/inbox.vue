<script setup lang="ts">
/**
 * Social Inbox — unified DMs, replies, mentions for FB / IG / Threads
 * /social/inbox
 */

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})
useHead({ title: 'Inbox | Social | Earnest' })

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
} = useSocialInbox()

const toast = useToast()

async function onSend(text: string) {
  if (!selectedThreadId.value) return
  try {
    await send(selectedThreadId.value, { text })
  } catch (err: any) {
    toast.add({
      title: 'Send failed',
      description: err?.data?.message || err?.message || 'Could not deliver reply',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  }
}

async function onArchive(value: boolean) {
  if (!selectedThreadId.value) return
  await setArchived(selectedThreadId.value, value)
}
</script>

<template>
  <LayoutPageContainer>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Inbox</h1>
        <p class="mt-1 text-sm text-gray-500">DMs, replies, and mentions across Facebook, Instagram, and Threads.</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          :variant="archived ? 'soft' : 'ghost'"
          size="sm"
          :icon="archived ? 'i-lucide-archive' : 'i-lucide-archive'"
          @click="archived = !archived"
        >
          {{ archived ? 'Showing archived' : 'Active only' }}
        </UButton>
        <UButton to="/social/settings" variant="ghost" size="sm" icon="i-lucide-settings">
          Settings
        </UButton>
      </div>
    </div>

    <!-- Split-pane shell -->
    <div class="grid h-[calc(100vh-180px)] grid-cols-12 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
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
  </LayoutPageContainer>
</template>
