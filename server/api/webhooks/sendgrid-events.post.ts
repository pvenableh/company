// server/api/webhooks/sendgrid-events.post.ts
/**
 * SendGrid Event Webhook endpoint.
 *
 * Receives SendGrid event notifications (delivered, open, click, bounce,
 * dropped, spam_report, etc.) and stores them in the `email_events`
 * Directus collection (matches the EmailEvent type in shared/directus.ts;
 * previously this code wrote to a non-existent `email_activity` collection
 * and SendGrid retries were silently swallowed because we still returned 200).
 *
 * The SendGrid account is SHARED with other Hue Studios systems. To avoid
 * storing foreign events, we drop anything that doesn't carry the `app:
 * 'earnest'` custom arg (set by every Earnest sender — see
 * `server/utils/email-send.ts` and `server/api/email/newsletter-send.post.ts`).
 * A fallback also accepts events whose `category` array contains 'earnest'.
 *
 * SendGrid sends arrays of events — each event has:
 *   - email: recipient address
 *   - event: event type (delivered, open, click, bounce, etc.)
 *   - timestamp: unix timestamp
 *   - sg_message_id: SendGrid message ID
 *   - category: string | string[] (SendGrid's `categories` array)
 *   - plus optional fields (url, ip, useragent, etc.)
 *
 * Earnest custom args (set on every Earnest send):
 *   - app: always 'earnest' (filter marker for the shared SendGrid account)
 *   - organization: the org uuid
 *   - email_name: human-readable name of the email/campaign
 *   - send_collection: which Directus collection triggered the send
 *   - send_id: the Directus item ID within send_collection
 *   - template_id: (marketing only) FK to email_templates
 */

import { createItem } from '@directus/sdk';

interface SendGridEvent {
  email: string;
  event: string;
  timestamp: number;
  sg_message_id?: string;
  sg_event_id?: string;
  url?: string;
  ip?: string;
  useragent?: string;
  category?: string | string[];
  reason?: string;
  // Custom args (top-level on the event payload)
  app?: string;
  organization?: string;
  email_name?: string;
  send_collection?: string;
  send_id?: string;
  template_id?: string;
}

function isEarnestEvent(e: SendGridEvent): boolean {
  if (e.app === 'earnest') return true;
  if (Array.isArray(e.category)) return e.category.includes('earnest');
  if (typeof e.category === 'string') return e.category === 'earnest';
  return false;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);

    // SendGrid sends an array of events
    const allEvents: SendGridEvent[] = Array.isArray(body) ? body : [body];

    if (!allEvents.length) {
      return { ok: true, processed: 0, skipped: 0 };
    }

    // Filter to Earnest events only — the SendGrid account is shared with other
    // systems and we don't want to store their open/click/bounce events here.
    const events = allEvents.filter(isEarnestEvent);
    const skipped = allEvents.length - events.length;

    if (!events.length) {
      return { ok: true, processed: 0, skipped };
    }

    const directus = getServerDirectus();
    let processed = 0;
    let failed = 0;

    // Process events in batches to avoid overwhelming the DB
    const batchSize = 25;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map((sgEvent) => {
          // `email_id` is the FK to the originating `emails` campaign row, so
          // it must only be set when the upstream send_collection IS `emails`.
          // Transactional sends pass `send_id` referring to other tables
          // (org_memberships, video_meetings, etc.) — writing those as the FK
          // would create dangling references and 4xx the createItem call.
          const isCampaignEvent = sgEvent.send_collection === 'emails' && !!sgEvent.send_id;

          const eventData: Record<string, any> = {
            email_id: isCampaignEvent ? sgEvent.send_id : null,
            sg_event_id: sgEvent.sg_event_id || null,
            sg_message_id: sgEvent.sg_message_id || null,
            recipient: sgEvent.email,
            event: sgEvent.event,
            timestamp: sgEvent.timestamp
              ? new Date(sgEvent.timestamp * 1000).toISOString()
              : new Date().toISOString(),
            organization: sgEvent.organization || null,
            url: sgEvent.url || null,
            reason: sgEvent.reason || null,
            raw: {
              email_name: sgEvent.email_name || null,
              send_collection: sgEvent.send_collection || null,
              send_id: sgEvent.send_id || null,
              template_id: sgEvent.template_id || null,
              category: sgEvent.category || null,
              ip: sgEvent.ip,
              useragent: sgEvent.useragent,
            },
          };

          return directus.request(createItem('email_events', eventData));
        }),
      );

      processed += results.filter((r) => r.status === 'fulfilled').length;
      failed += results.filter((r) => r.status === 'rejected').length;
    }

    if (failed > 0) {
      console.warn(`[sendgrid-events] ${failed} event(s) failed to store`);
    }

    return { ok: true, processed, failed, skipped };
  } catch (error: any) {
    console.error('[sendgrid-events] Error:', error);

    // SendGrid expects 2xx to stop retrying
    // Return 200 even on partial failure to prevent infinite retries
    return { ok: false, error: error.message };
  }
});
