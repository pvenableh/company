/**
 * Shared webhook event router for FB / IG / Threads.
 *
 * Each platform's webhook.post.ts calls `routeWebhookEvent()` with the parsed
 * Meta payload. The router:
 *   1. Looks up the social_accounts row by entry.id (Page id, IG user id, or Threads user id)
 *   2. For each entry.messaging[]: upsert social_threads + insert social_messages
 *   3. For each entry.changes[] (feed/comments/replies/mentions): insert social_activity
 *
 * All writes go through the admin Directus token. Idempotency keys: thread by
 * (account, thread_id), message by platform_message_id, activity by (ref_id, type).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || ''

type Platform = 'facebook' | 'instagram' | 'threads'

type MetaWebhookPayload = {
  object?: string
  entry?: Array<{
    id?: string
    time?: number
    messaging?: Array<MetaMessagingEvent>
    changes?: Array<MetaChange>
  }>
}

type MetaMessagingEvent = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    attachments?: Array<{ type?: string; payload?: { url?: string } }>
  }
  reaction?: { mid?: string; reaction?: string; emoji?: string }
  read?: { watermark?: number }
}

type MetaChange = {
  field?: string
  value?: Record<string, any>
}

async function directus<T = unknown>(method: string, path: string, body?: unknown): Promise<T | null> {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[social-inbox] Directus ${method} ${path} → ${res.status}: ${text}`)
    return null
  }
  const json = (await res.json()) as { data?: T }
  return (json.data as T) ?? null
}

async function findAccountByPlatformId(
  platform: Platform,
  platformUserId: string,
): Promise<{ id: string; organization: string; metadata?: Record<string, any> } | null> {
  const params = new URLSearchParams({
    'filter[platform][_eq]': platform,
    'filter[platform_user_id][_eq]': platformUserId,
    fields: 'id,organization,metadata',
    limit: '1',
  })
  const accounts = await directus<Array<{ id: string; organization: string; metadata?: Record<string, any> }>>(
    'GET',
    `/items/social_accounts?${params}`,
  )
  return accounts && accounts[0] ? accounts[0] : null
}

async function upsertThread(
  accountId: string,
  organizationId: string,
  platform: Platform,
  threadId: string,
  participantId: string,
  participantName: string | null,
  preview: string | null,
  lastMessageAt: string,
): Promise<{ id: string } | null> {
  const params = new URLSearchParams({
    'filter[account][_eq]': accountId,
    'filter[thread_id][_eq]': threadId,
    fields: 'id,unread_count',
    limit: '1',
  })
  const existing = await directus<Array<{ id: string; unread_count?: number }>>(
    'GET',
    `/items/social_threads?${params}`,
  )

  if (existing && existing[0]) {
    const updated = await directus<{ id: string }>('PATCH', `/items/social_threads/${existing[0].id}`, {
      last_message_at: lastMessageAt,
      last_message_preview: preview,
      unread_count: (existing[0].unread_count || 0) + 1,
    })
    return updated
  }

  return directus<{ id: string }>('POST', `/items/social_threads`, {
    organization: organizationId,
    account: accountId,
    platform,
    thread_id: threadId,
    participant_id: participantId,
    participant_name: participantName,
    last_message_at: lastMessageAt,
    last_message_preview: preview,
    unread_count: 1,
  })
}

async function insertMessage(
  threadDbId: string,
  organizationId: string,
  platformMessageId: string,
  fromId: string,
  isOutgoing: boolean,
  text: string | null,
  attachments: Array<{ type: string; url: string }> | null,
  createdAt: string,
): Promise<void> {
  // Idempotent insert keyed by platform_message_id
  const params = new URLSearchParams({
    'filter[platform_message_id][_eq]': platformMessageId,
    fields: 'id',
    limit: '1',
  })
  const existing = await directus<Array<{ id: string }>>('GET', `/items/social_messages?${params}`)
  if (existing && existing[0]) return

  await directus('POST', '/items/social_messages', {
    thread: threadDbId,
    organization: organizationId,
    platform_message_id: platformMessageId,
    from_id: fromId,
    is_outgoing: isOutgoing,
    text,
    attachments: attachments && attachments.length ? attachments : null,
    created_at: createdAt,
  })
}

async function insertActivity(
  organizationId: string,
  accountId: string,
  platform: Platform,
  type: 'comment' | 'mention' | 'reaction' | 'follow' | 'lead',
  refId: string,
  postId: string | null,
  actorId: string | null,
  actorName: string | null,
  preview: string | null,
  createdAt: string,
  rawPayload: Record<string, any>,
): Promise<void> {
  // Idempotent insert keyed by ref_id + type (one webhook can fire twice)
  const params = new URLSearchParams({
    'filter[ref_id][_eq]': refId,
    'filter[type][_eq]': type,
    fields: 'id',
    limit: '1',
  })
  const existing = await directus<Array<{ id: string }>>('GET', `/items/social_activity?${params}`)
  if (existing && existing[0]) return

  await directus('POST', '/items/social_activity', {
    organization: organizationId,
    account: accountId,
    platform,
    type,
    ref_id: refId,
    post_id: postId,
    actor_id: actorId,
    actor_name: actorName,
    preview,
    raw_payload: rawPayload,
    read: false,
    created_at: createdAt,
  })
}

// ─── Per-platform handlers ──────────────────────────────────────────────────

async function handleMessagingEvent(
  account: { id: string; organization: string },
  platform: Platform,
  pageOrAccountId: string,
  event: MetaMessagingEvent,
): Promise<void> {
  const senderId = event.sender?.id
  const recipientId = event.recipient?.id
  if (!senderId || !recipientId) return

  // Determine the human counterpart (the participant that isn't the Page/account)
  const isOutgoing = senderId === pageOrAccountId || event.message?.is_echo === true
  const participantId = isOutgoing ? recipientId : senderId
  const fromId = senderId
  const ts = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString()

  // Reactions / read receipts can come without a message body
  if (!event.message?.mid) {
    if (event.reaction?.mid) {
      // Treat reactions as activity, not messages
      await insertActivity(
        account.organization,
        account.id,
        platform,
        'reaction',
        event.reaction.mid,
        null,
        senderId,
        null,
        event.reaction.emoji || event.reaction.reaction || null,
        ts,
        event as Record<string, any>,
      )
    }
    return
  }

  const text = event.message.text || null
  const attachments = (event.message.attachments || [])
    .map((a) => ({
      type: (a.type as string) || 'file',
      url: a.payload?.url || '',
    }))
    .filter((a) => a.url)

  // Synthetic thread_id keyed off the participant — Meta's t_{...} comes from
  // the conversations API, not the webhook payload, so we generate a stable id.
  const threadKey = `${platform}:${pageOrAccountId}:${participantId}`

  const thread = await upsertThread(
    account.id,
    account.organization,
    platform,
    threadKey,
    participantId,
    null,
    text || (attachments[0]?.type ? `[${attachments[0].type}]` : null),
    ts,
  )
  if (!thread) return

  await insertMessage(
    thread.id,
    account.organization,
    event.message.mid,
    fromId,
    isOutgoing,
    text,
    attachments.length ? attachments : null,
    ts,
  )
}

async function handleChange(
  account: { id: string; organization: string },
  platform: Platform,
  change: MetaChange,
): Promise<void> {
  const value = change.value || {}
  const field = change.field || ''

  // FB Page feed: comment | reaction | post | etc.
  if (field === 'feed') {
    const item = value.item as string | undefined
    if (item === 'comment' && value.comment_id) {
      await insertActivity(
        account.organization,
        account.id,
        platform,
        'comment',
        String(value.comment_id),
        value.post_id ? String(value.post_id) : null,
        value.from?.id ? String(value.from.id) : null,
        value.from?.name || null,
        value.message || null,
        value.created_time ? new Date(value.created_time).toISOString() : new Date().toISOString(),
        value,
      )
    }
    return
  }

  // FB / IG / Threads explicit comment / mention / reply / quote events
  if (field === 'comments' || field === 'mention' || field === 'mentions') {
    const refId = String(value.id || value.comment_id || value.media_id || `${field}-${Date.now()}`)
    await insertActivity(
      account.organization,
      account.id,
      platform,
      field === 'comments' ? 'comment' : 'mention',
      refId,
      value.media_id ? String(value.media_id) : null,
      value.from?.id ? String(value.from.id) : null,
      value.from?.username || value.from?.name || null,
      value.text || value.message || null,
      value.timestamp ? new Date(value.timestamp).toISOString() : new Date().toISOString(),
      value,
    )
    return
  }

  // Threads webhook fields: replies, mentions, quotes, reposts
  if (field === 'replies' || field === 'quotes' || field === 'reposts') {
    const refId = String(value.id || `${field}-${Date.now()}`)
    await insertActivity(
      account.organization,
      account.id,
      platform,
      field === 'replies' ? 'comment' : 'mention',
      refId,
      value.root_post?.id || value.replied_to?.id || null,
      value.from?.id ? String(value.from.id) : null,
      value.from?.username || value.username || null,
      value.text || null,
      value.timestamp ? new Date(value.timestamp).toISOString() : new Date().toISOString(),
      value,
    )
    return
  }
}

// ─── Public entry point ─────────────────────────────────────────────────────

export async function routeWebhookEvent(payload: MetaWebhookPayload): Promise<{
  processed: number
  skipped: number
}> {
  if (!DIRECTUS_TOKEN) {
    console.error('[social-inbox] DIRECTUS_SERVER_TOKEN not configured — cannot persist events')
    return { processed: 0, skipped: 0 }
  }

  const object = payload.object || ''
  // Map Meta's object name to our internal platform key
  const platform: Platform | null =
    object === 'page' ? 'facebook' : object === 'instagram' ? 'instagram' : object === 'threads' ? 'threads' : null

  if (!platform) {
    console.warn(`[social-inbox] Unknown webhook object: ${object}`)
    return { processed: 0, skipped: 0 }
  }

  let processed = 0
  let skipped = 0

  for (const entry of payload.entry || []) {
    const entryId = entry.id
    if (!entryId) {
      skipped++
      continue
    }

    const account = await findAccountByPlatformId(platform, entryId)
    if (!account) {
      // Webhook for an account we don't manage — ack and move on
      skipped++
      continue
    }

    for (const event of entry.messaging || []) {
      try {
        await handleMessagingEvent(account, platform, entryId, event)
        processed++
      } catch (err) {
        console.error(`[social-inbox] messaging error:`, err)
      }
    }

    for (const change of entry.changes || []) {
      try {
        await handleChange(account, platform, change)
        processed++
      } catch (err) {
        console.error(`[social-inbox] change error:`, err)
      }
    }
  }

  return { processed, skipped }
}
