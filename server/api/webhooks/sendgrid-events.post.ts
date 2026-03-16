// server/api/webhooks/sendgrid-events.post.ts
/**
 * SendGrid Event Webhook endpoint.
 *
 * Receives SendGrid event notifications (delivered, open, click, bounce,
 * dropped, spam_report, etc.) and stores them in the `email_activity`
 * Directus collection.
 *
 * SendGrid sends arrays of events — each event has:
 *   - email: recipient address
 *   - event: event type (delivered, open, click, bounce, etc.)
 *   - timestamp: unix timestamp
 *   - sg_message_id: SendGrid message ID
 *   - plus optional fields (url, ip, useragent, etc.)
 *
 * Custom args (set when sending via SendGrid):
 *   - send_collection: which Directus collection triggered the send
 *   - send_id: the Directus item ID
 *   - organization: the org ID
 */

import { createItem } from '@directus/sdk';

interface SendGridEvent {
  email: string;
  event: string;
  timestamp: number;
  sg_message_id?: string;
  url?: string;
  ip?: string;
  useragent?: string;
  // Custom args
  send_collection?: string;
  send_id?: string;
  organization?: string;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);

    // SendGrid sends an array of events
    const events: SendGridEvent[] = Array.isArray(body) ? body : [body];

    if (!events.length) {
      return { ok: true, processed: 0 };
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
          const activityData: Record<string, any> = {
            email_id: sgEvent.sg_message_id || null,
            recipient: sgEvent.email,
            event: sgEvent.event,
            timestamp: sgEvent.timestamp
              ? new Date(sgEvent.timestamp * 1000).toISOString()
              : new Date().toISOString(),
            send_collection: sgEvent.send_collection || null,
            send_id: sgEvent.send_id || null,
            organization: sgEvent.organization || null,
            metadata: {
              url: sgEvent.url,
              ip: sgEvent.ip,
              useragent: sgEvent.useragent,
            },
          };

          return directus.request(createItem('email_activity', activityData));
        }),
      );

      processed += results.filter((r) => r.status === 'fulfilled').length;
      failed += results.filter((r) => r.status === 'rejected').length;
    }

    if (failed > 0) {
      console.warn(`[sendgrid-events] ${failed} event(s) failed to store`);
    }

    return { ok: true, processed, failed };
  } catch (error: any) {
    console.error('[sendgrid-events] Error:', error);

    // SendGrid expects 2xx to stop retrying
    // Return 200 even on partial failure to prevent infinite retries
    return { ok: false, error: error.message };
  }
});
