<script setup lang="ts">
import { ref, watch } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MessageSquare, MessageCircle, AtSign, Heart, Bell } from 'lucide-vue-next'
import { getSocialPlatformIcon } from '~/utils/icons'

const { activity, unread, refreshFeed, markRead } = useSocialActivity()
const isOpen = ref(false)

// Hide the bell entirely until at least one social account is connected —
// otherwise it's a permanent zero-state with no path forward from the popover.
const { data: accountsData } = useFetch('/api/social/accounts', {
  default: () => ({ data: [] as any[] }),
})
const hasConnectedAccounts = computed(() => {
  const list = (accountsData.value as any)?.data ?? accountsData.value
  return Array.isArray(list) ? list.length > 0 : false
})

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

    <PopoverContent align="end" :side-offset="8" class="w-96 max-h-[70vh] overflow-y-auto p-2">
      <div class="flex items-center justify-between px-2 py-1.5">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Social Inbox
        </p>
        <NuxtLink
          to="/inbox"
          class="text-[10px] font-medium text-primary hover:underline"
          @click="isOpen = false"
        >
          Open inbox →
        </NuxtLink>
      </div>

      <div v-if="!activity.length" class="px-2 py-6 text-center text-xs text-muted-foreground">
        Nothing new.
      </div>

      <ul v-else class="space-y-0.5">
        <li
          v-for="a in activity"
          :key="a.id"
          class="flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
          :class="!a.read ? 'bg-primary/5' : ''"
        >
          <div class="relative shrink-0">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <component :is="activityIcon(a.type)" class="h-3.5 w-3.5 text-primary" />
            </div>
            <span
              class="absolute -bottom-0.5 -right-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-background p-px ring-2 ring-background"
            >
              <UIcon
                :name="getSocialPlatformIcon(a.platform)"
                class="h-full w-full"
              />
            </span>
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-xs leading-tight">
              <span class="font-medium text-foreground">{{ a.actor_name || 'Someone' }}</span>
              <span class="text-muted-foreground"> {{ a.type === 'mention' ? 'mentioned you' : a.type === 'reaction' ? 'reacted' : 'commented' }}</span>
            </p>
            <p v-if="a.preview" class="mt-0.5 truncate text-[10px] text-muted-foreground">
              {{ a.preview }}
            </p>
            <p class="mt-0.5 text-[10px] text-muted-foreground/70">
              {{ a.account.account_name }} · {{ timeAgo(a.created_at) }}
            </p>
          </div>

          <button
            v-if="!a.read"
            class="shrink-0 text-[10px] font-medium text-primary hover:underline"
            @click="markRead(a.id)"
          >
            Mark read
          </button>
        </li>
      </ul>
    </PopoverContent>
  </Popover>
</template>
