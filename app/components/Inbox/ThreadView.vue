<script setup lang="ts">
import { format } from 'date-fns'
import { getSocialPlatformIcon } from '~/utils/icons'
import type { InboxThread, InboxMessage } from '~/composables/useSocialInbox'

const props = defineProps<{
  thread: (InboxThread & { messages?: InboxMessage[] }) | null
  messages: InboxMessage[]
  loading: boolean
}>()

const emit = defineEmits<{
  send: [payload: { text?: string; mediaUrl?: string; mediaType?: 'image' | 'video' | 'audio' | 'file' }]
  archive: [archived: boolean]
}>()

const scroller = ref<HTMLElement | null>(null)

watch(
  () => props.messages.length,
  () => {
    nextTick(() => {
      if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
    })
  },
  { flush: 'post' },
)

function fmt(iso: string) {
  try {
    return format(new Date(iso), 'MMM d, h:mm a')
  } catch {
    return ''
  }
}

const composerHint = computed(() => {
  if (!props.thread) return null
  if (props.thread.platform === 'threads') return 'Replies on Threads are public posts.'
  // 24-hour window warning is a heuristic — Meta enforces it server-side
  const lastInbound = [...props.messages].reverse().find((m) => !m.is_outgoing)
  if (!lastInbound) return null
  const ageHours = (Date.now() - new Date(lastInbound.created_at).getTime()) / 3_600_000
  if (ageHours > 24) return 'Standard messaging window has elapsed (24h). Reply may be rejected.'
  return null
})
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <div v-if="!thread" class="flex h-full items-center justify-center text-sm text-muted-foreground">
      Select a conversation to read
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <div class="flex items-center gap-3">
          <div class="relative">
            <div class="h-9 w-9 overflow-hidden rounded-full bg-muted">
              <img v-if="thread.participant_avatar" :src="thread.participant_avatar" class="h-full w-full object-cover" alt="" />
              <div v-else class="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
                {{ (thread.participant_name || '?').charAt(0).toUpperCase() }}
              </div>
            </div>
            <span
              class="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-card p-px ring-2 ring-card"
            >
              <Icon
                :name="getSocialPlatformIcon(thread.platform)"
                class="h-full w-full"
              />
            </span>
          </div>
          <div>
            <p class="text-sm font-medium text-foreground">
              {{ thread.participant_name || thread.participant_id }}
            </p>
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground">
              via {{ thread.account.account_name }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            variant="ghost"
            size="sm"
            :icon="thread.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
            @click="emit('archive', !thread.archived)"
          >
            {{ thread.archived ? 'Restore' : 'Archive' }}
          </UButton>
        </div>
      </div>

      <!-- Messages -->
      <div ref="scroller" class="flex-1 overflow-y-auto px-4 py-4">
        <div v-if="loading && !messages.length" class="text-center text-sm text-muted-foreground">Loading…</div>
        <div v-else-if="!messages.length" class="text-center text-sm text-muted-foreground">No messages yet.</div>

        <div v-for="m in messages" :key="m.id" class="mb-3 flex" :class="m.is_outgoing ? 'justify-end' : 'justify-start'">
          <div
            class="max-w-[70%] rounded-2xl px-3.5 py-2 text-sm"
            :class="m.is_outgoing
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'"
          >
            <p v-if="m.text" class="whitespace-pre-wrap break-words">{{ m.text }}</p>
            <div v-if="m.attachments && m.attachments.length" class="mt-1 flex flex-wrap gap-1">
              <a
                v-for="(a, i) in m.attachments"
                :key="i"
                :href="a.url"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1 rounded bg-black/10 px-2 py-0.5 text-[11px] hover:bg-black/20"
              >
                <Icon
                  :name="a.type === 'image' ? 'i-lucide-image' : a.type === 'video' ? 'i-lucide-video' : 'i-lucide-paperclip'"
                  class="h-3 w-3"
                />
                {{ a.type }}
              </a>
            </div>
            <p
              class="mt-1 text-[10px]"
              :class="m.is_outgoing ? 'text-primary-foreground/70' : 'text-muted-foreground'"
            >
              {{ fmt(m.created_at) }}
            </p>
            <div
              v-if="Array.isArray(m.reactions) && m.reactions.length"
              class="mt-1 flex flex-wrap gap-1"
            >
              <span
                v-for="(r, i) in m.reactions"
                :key="i"
                class="rounded-full bg-card px-1.5 py-0.5 text-sm leading-none shadow-sm ring-1 ring-border"
                :title="r.from_id || ''"
              >{{ r.emoji || r.reaction || '👍' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Composer -->
      <InboxMessageComposer
        :hint="composerHint"
        :media-disabled="thread.platform === 'threads'"
        @send="emit('send', $event)"
      />
    </template>
  </div>
</template>
