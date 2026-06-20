/**
 * Social Activity composable — comments / mentions / reactions feed for the
 * header bell + activity tab. Polls every 60s for unread count.
 */

export interface ActivityItem {
  id: string
  platform: 'facebook' | 'instagram' | 'threads'
  type: 'comment' | 'mention' | 'reaction' | 'follow' | 'lead'
  ref_id: string
  post_id: string | null
  actor_id: string | null
  actor_name: string | null
  preview: string | null
  read: boolean
  created_at: string
  account: {
    id: string
    account_name: string
    account_handle: string
    profile_picture_url: string | null
  }
}

export function useSocialActivity(opts: { autoPoll?: boolean; enabled?: boolean } = {}) {
  const autoPoll = opts.autoPoll !== false
  // Social activity (platform comments/mentions/DMs) needs live platform APIs.
  // When disabled, skip the initial fetches AND the poll so nothing hits the
  // social endpoints while publishing is off.
  const enabled = opts.enabled !== false

  const { data: feedData, refresh: refreshFeed } = useFetch('/api/social/activity', {
    query: { limit: 20 },
    default: () => ({ data: [] as ActivityItem[] }),
    immediate: enabled,
  })
  const activity = computed(() => (feedData.value?.data || []) as ActivityItem[])

  const { data: unreadData, refresh: refreshUnread } = useFetch('/api/social/activity/unread-count', {
    default: () => ({ data: { activity: 0, messages: 0, total: 0 } }),
    immediate: enabled,
  })
  const unread = computed(() => unreadData.value?.data || { activity: 0, messages: 0, total: 0 })

  async function markRead(id: string) {
    await $fetch(`/api/social/activity/${id}/mark-read`, { method: 'POST' })
    await Promise.all([refreshFeed(), refreshUnread()])
  }

  let pollHandle: ReturnType<typeof setInterval> | null = null
  if (import.meta.client && autoPoll && enabled) {
    onMounted(() => {
      pollHandle = setInterval(() => {
        if (document.visibilityState === 'visible') {
          refreshUnread()
        }
      }, 60_000)
    })
    onUnmounted(() => {
      if (pollHandle) clearInterval(pollHandle)
    })
  }

  return { activity, unread, refreshFeed, refreshUnread, markRead }
}
