/**
 * Subscribe / unsubscribe a Meta object (Page or IG user) to webhook events.
 *
 * Without this opt-in step the dashboard's webhook subscription is app-level
 * only — actual events for a specific Page or IG account never fire.
 *
 * Docs:
 *   - FB Pages: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#subscribed-apps
 *   - IG Direct: https://developers.facebook.com/docs/instagram-platform/webhooks
 */

const FB_PAGE_FIELDS = [
  'messages',
  'messaging_postbacks',
  'messaging_seen',
  'message_echoes',
  'message_reactions',
  'feed',
  'mention',
].join(',')

const IG_FIELDS = [
  'messages',
  'messaging_postbacks',
  'messaging_seen',
  'message_reactions',
  'comments',
  'mentions',
].join(',')

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

export async function subscribeMetaPage(
  pageId: string,
  pageAccessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  return subscribe(pageId, pageAccessToken, FB_PAGE_FIELDS, 'page')
}

export async function subscribeInstagramAccount(
  pageId: string,
  pageAccessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  // IG webhooks for the new flow are still administered through the Page that
  // owns the IG account — calling subscribe on the Page registers both feeds.
  return subscribe(pageId, pageAccessToken, IG_FIELDS, 'instagram')
}

async function subscribe(
  objectId: string,
  accessToken: string,
  subscribedFields: string,
  label: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${GRAPH_URL}/${objectId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        subscribed_fields: subscribedFields,
        access_token: accessToken,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text()
      console.warn(`[meta-subscribe:${label}] ${objectId} → ${res.status}: ${text}`)
      return { ok: false, error: text }
    }
    return { ok: true }
  } catch (err: any) {
    console.warn(`[meta-subscribe:${label}] ${objectId} threw:`, err.message)
    return { ok: false, error: err.message }
  }
}

export async function unsubscribeMetaPage(
  pageId: string,
  pageAccessToken: string,
): Promise<void> {
  try {
    await fetch(`${GRAPH_URL}/${pageId}/subscribed_apps`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: pageAccessToken }).toString(),
    })
  } catch (err: any) {
    console.warn(`[meta-subscribe:unsubscribe] ${pageId} threw:`, err.message)
  }
}
