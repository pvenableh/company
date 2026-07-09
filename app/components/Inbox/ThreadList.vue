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
  <div class="flex h-full flex-col border-r border-border">
    <!-- Sticky platform filter chips -->
    <div class="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-card p-2">
      <button
        v-for="chip in platformChips"
        :key="chip.value"
        class="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition"
        :class="platformFilter === chip.value
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-accent'"
        @click="emit('update:platformFilter', chip.value)"
      >
        <Icon v-if="chip.icon" :name="chip.icon" class="h-3.5 w-3.5" />
        {{ chip.label }}
      </button>
    </div>

    <!-- Thread list -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading && !threads.length" class="p-8 text-center text-sm text-muted-foreground">Loading...</div>
      <div v-else-if="!threads.length" class="p-8 text-center">
        <Icon name="i-lucide-inbox" class="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p class="mt-2 text-sm text-muted-foreground">No conversations yet</p>
        <p class="mt-1 text-xs text-muted-foreground">Connect a Page to start receiving messages</p>
      </div>

      <button
        v-for="t in threads"
        :key="t.id"
        class="flex w-full items-start gap-3 border-b border-border p-3 text-left transition hover:bg-muted/30"
        :class="selectedId === t.id ? 'bg-primary/10' : ''"
        @click="emit('select', t.id)"
      >
        <!-- Avatar -->
        <div class="relative shrink-0">
          <div class="h-10 w-10 overflow-hidden rounded-full bg-muted">
            <img
              v-if="t.participant_avatar"
              :src="t.participant_avatar"
              class="h-full w-full object-cover"
              alt=""
            />
            <div v-else class="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
              {{ (t.participant_name || '?').charAt(0).toUpperCase() }}
            </div>
          </div>
          <!-- Platform badge -->
          <span
            class="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-card p-px ring-2 ring-card"
          >
            <Icon
              :name="getSocialPlatformIcon(t.platform)"
              class="h-full w-full"
            />
          </span>
        </div>

        <!-- Body -->
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate text-sm font-medium text-foreground">
              {{ t.participant_name || t.participant_id }}
            </span>
            <span class="shrink-0 text-[10px] text-muted-foreground">{{ timeAgo(t.last_message_at) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <p class="truncate text-xs text-muted-foreground">
              {{ t.last_message_preview || '—' }}
            </p>
            <span
              v-if="(t.unread_count || 0) > 0"
              class="ml-auto inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
            >
              {{ t.unread_count }}
            </span>
          </div>
          <p class="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {{ t.account.account_name }}
          </p>
        </div>
      </button>
    </div>
  </div>
</template>
