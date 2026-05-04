/**
 * Social Inbox composable — fetch threads, fetch messages for a thread, send replies, mark read.
 *
 * Uses 30s polling for now; can be upgraded to SSE later (see Phase 6 v2 in
 * docs/social-messaging-implementation-plan.md).
 */

export type InboxPlatform = 'facebook' | 'instagram' | 'threads' | 'all'

export interface InboxThread {
  id: string
  platform: 'facebook' | 'instagram' | 'threads'
  thread_id: string
  participant_id: string
  participant_name?: string | null
  participant_avatar?: string | null
  last_message_at: string
  last_message_preview?: string | null
  unread_count?: number
  archived?: boolean
  account: {
    id: string
    platform: string
    account_name: string
    account_handle: string
    profile_picture_url: string | null
    platform_user_id: string
  }
}

export interface InboxMessage {
  id: string
  platform_message_id: string
  from_id: string
  is_outgoing: boolean
  text: string | null
  attachments: Array<{ type: string; url: string }> | null
  created_at: string
}

export function useSocialInbox() {
  const platformFilter = useState<InboxPlatform>('inbox-platform', () => 'all')
  const archived = useState<boolean>('inbox-archived', () => false)
  const selectedThreadId = useState<string | null>('inbox-selected-thread', () => null)

  const threadQuery = computed(() => ({
    platform: platformFilter.value === 'all' ? undefined : platformFilter.value,
    archived: archived.value ? 'true' : 'false',
    limit: 50,
  }))

  const { data: threadsData, refresh: refreshThreads, pending: threadsLoading } = useFetch('/api/social/threads', {
    query: threadQuery,
    default: () => ({ data: [] as InboxThread[] }),
  })
  const threads = computed(() => (threadsData.value?.data || []) as InboxThread[])

  // Selected thread (with full message list)
  const { data: threadDetail, refresh: refreshThread, pending: threadLoading } = useFetch(
    () => (selectedThreadId.value ? `/api/social/threads/${selectedThreadId.value}` : null),
    { default: () => null, watch: [selectedThreadId] },
  )
  const messages = computed(() => ((threadDetail.value as any)?.data?.messages || []) as InboxMessage[])
  const selectedThread = computed(() => (threadDetail.value as any)?.data || null)

  async function selectThread(id: string) {
    selectedThreadId.value = id
    // Fire mark-read in background
    try {
      await $fetch(`/api/social/threads/${id}/mark-read`, { method: 'POST' })
    } catch {
      /* non-fatal */
    }
    await refreshThreads()
  }

  async function send(threadId: string, payload: { text?: string; mediaUrl?: string; mediaType?: 'image' | 'video' | 'audio' | 'file' }) {
    await $fetch(`/api/social/threads/${threadId}/messages`, {
      method: 'POST',
      body: payload,
    })
    await Promise.all([refreshThread(), refreshThreads()])
  }

  async function setArchived(threadId: string, value: boolean) {
    await $fetch(`/api/social/threads/${threadId}`, {
      method: 'PATCH',
      body: { archived: value },
    })
    await refreshThreads()
  }

  // Polling — 30s when tab visible
  let pollHandle: ReturnType<typeof setInterval> | null = null
  if (import.meta.client) {
    onMounted(() => {
      pollHandle = setInterval(() => {
        if (document.visibilityState === 'visible') {
          refreshThreads()
          if (selectedThreadId.value) refreshThread()
        }
      }, 30_000)
    })
    onUnmounted(() => {
      if (pollHandle) clearInterval(pollHandle)
    })
  }

  return {
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
    refreshThreads,
    refreshThread,
  }
}
