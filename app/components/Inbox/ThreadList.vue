<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { getSocialPlatformIcon } from '~/utils/icons'
import type { InboxThread, InboxPlatform } from '~/composables/useSocialInbox'

defineProps<{
  threads: InboxThread[]
  selectedId: string | null
  loading: boolean
  platformFilter: InboxPlatform
}>()

const emit = defineEmits<{
  select: [id: string]
  'update:platformFilter': [value: InboxPlatform]
}>()

const platformChips: Array<{ value: InboxPlatform; label: string; icon?: string }> = [
  { value: 'all', label: 'All' },
  { value: 'facebook', label: 'Facebook', icon: 'logos:facebook' },
  { value: 'instagram', label: 'Instagram', icon: 'logos:instagram-icon' },
  { value: 'threads', label: 'Threads', icon: 'simple-icons:threads' },
]

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="flex h-full flex-col border-r border-gray-200 dark:border-gray-800">
    <!-- Sticky platform filter chips -->
    <div class="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
      <button
        v-for="chip in platformChips"
        :key="chip.value"
        class="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition"
        :class="platformFilter === chip.value
          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'"
        @click="emit('update:platformFilter', chip.value)"
      >
        <Icon v-if="chip.icon" :name="chip.icon" class="h-3.5 w-3.5" />
        {{ chip.label }}
      </button>
    </div>

    <!-- Thread list -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading && !threads.length" class="p-8 text-center text-sm text-gray-400">Loading...</div>
      <div v-else-if="!threads.length" class="p-8 text-center">
        <Icon name="i-lucide-inbox" class="mx-auto h-10 w-10 text-gray-300 dark:text-gray-700" />
        <p class="mt-2 text-sm text-gray-500">No conversations yet</p>
        <p class="mt-1 text-xs text-gray-400">Connect a Page to start receiving messages</p>
      </div>

      <button
        v-for="t in threads"
        :key="t.id"
        class="flex w-full items-start gap-3 border-b border-gray-100 p-3 text-left transition hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40"
        :class="selectedId === t.id ? 'bg-blue-50 dark:bg-blue-950/30' : ''"
        @click="emit('select', t.id)"
      >
        <!-- Avatar -->
        <div class="relative shrink-0">
          <div class="h-10 w-10 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <img
              v-if="t.participant_avatar"
              :src="t.participant_avatar"
              class="h-full w-full object-cover"
              alt=""
            />
            <div v-else class="flex h-full w-full items-center justify-center text-sm font-medium text-gray-500">
              {{ (t.participant_name || '?').charAt(0).toUpperCase() }}
            </div>
          </div>
          <!-- Platform badge -->
          <Icon
            :name="getSocialPlatformIcon(t.platform)"
            class="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-white p-px ring-2 ring-white dark:bg-gray-900 dark:ring-gray-900"
          />
        </div>

        <!-- Body -->
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ t.participant_name || t.participant_id }}
            </span>
            <span class="shrink-0 text-[10px] text-gray-400">{{ timeAgo(t.last_message_at) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <p class="truncate text-xs text-gray-500 dark:text-gray-400">
              {{ t.last_message_preview || '—' }}
            </p>
            <span
              v-if="(t.unread_count || 0) > 0"
              class="ml-auto inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white"
            >
              {{ t.unread_count }}
            </span>
          </div>
          <p class="mt-0.5 text-[10px] uppercase tracking-wider text-gray-400">
            {{ t.account.account_name }}
          </p>
        </div>
      </button>
    </div>
  </div>
</template>
