<script setup lang="ts">
import { ref, watch } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MessageSquare, MessageCircle, AtSign, Heart, Bell } from 'lucide-vue-next'
import { getSocialPlatformIcon } from '~/utils/icons'

const { activity, unread, refreshFeed, markRead } = useSocialActivity()
const isOpen = ref(false)

watch(isOpen, (open) => {
  if (open) refreshFeed()
})

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

function activityIcon(type: string) {
  if (type === 'comment') return MessageCircle
  if (type === 'mention') return AtSign
  if (type === 'reaction') return Heart
  return Bell
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <button
        class="flex items-center justify-center relative rounded-full h-8 w-8 hover:bg-muted/50 text-muted-foreground transition-colors"
      >
        <MessageSquare class="size-4" />
        <div
          v-if="unread.total > 0"
          class="absolute -top-1 -right-1 text-[9px] leading-3 rounded-full min-w-4 h-4 px-1 bg-blue-600 flex items-center justify-center text-white font-bold"
        >
          {{ unread.total > 99 ? '99+' : unread.total }}
        </div>
      </button>
    </PopoverTrigger>

    <PopoverContent align="end" :side-offset="8" class="w-96 max-h-[70vh] overflow-y-auto p-0">
      <div class="flex items-center justify-between border-b p-3 dark:border-gray-700">
        <p class="text-sm font-bold">Social Activity</p>
        <NuxtLink
          to="/social/inbox"
          class="text-xs text-blue-600 hover:underline"
          @click="isOpen = false"
        >
          Open inbox →
        </NuxtLink>
      </div>

      <div v-if="!activity.length" class="p-8 text-center text-sm text-gray-400">
        Nothing new.
      </div>

      <ul v-else class="divide-y dark:divide-gray-800">
        <li
          v-for="a in activity"
          :key="a.id"
          class="flex items-start gap-3 p-3 transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
          :class="!a.read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''"
        >
          <div class="relative shrink-0">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <component :is="activityIcon(a.type)" class="h-4 w-4 text-gray-500" />
            </div>
            <UIcon
              :name="getSocialPlatformIcon(a.platform)"
              class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-white p-px ring-2 ring-white dark:bg-gray-900 dark:ring-gray-900"
            />
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-xs">
              <span class="font-medium">{{ a.actor_name || 'Someone' }}</span>
              <span class="text-gray-500"> {{ a.type === 'mention' ? 'mentioned you' : a.type === 'reaction' ? 'reacted' : 'commented' }}</span>
            </p>
            <p v-if="a.preview" class="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-400">
              {{ a.preview }}
            </p>
            <p class="mt-0.5 text-[10px] text-gray-400">
              {{ a.account.account_name }} · {{ timeAgo(a.created_at) }}
            </p>
          </div>

          <button
            v-if="!a.read"
            class="shrink-0 text-[10px] text-blue-600 hover:underline"
            @click="markRead(a.id)"
          >
            Mark read
          </button>
        </li>
      </ul>
    </PopoverContent>
  </Popover>
</template>
