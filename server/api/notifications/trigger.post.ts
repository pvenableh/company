// server/api/notifications/trigger.post.ts
/**
 * Webhook endpoint for Directus Flows to auto-generate notifications.
 *
 * Called by Directus Flows on item create/update/delete events.
 * Resolves recipients (assignees, mentioned users, watchers) and
 * creates notification records for each.
 *
 * Request body:
 * {
 *   collection: string,     // e.g. 'tickets', 'comments', 'messages'
 *   action: 'create' | 'update' | 'delete',
 *   item: object,           // The full or partial item data
 *   itemId: string,         // The item's primary key
 *   userId: string,         // The user who triggered the action
 *   orgId?: string,         // Organization ID (for org-scoped notifications)
 *   secret?: string,        // Optional webhook secret for validation
 * }
 */

import { createNotification } from '@directus/sdk';
import { resolveNotificationTargets } from '~/server/utils/notificationRecipients';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { collection, action, item, itemId, userId, orgId, secret } = body;

    // Validate required fields
    if (!collection || !action || !itemId || !userId) {
      throw createError({
        statusCode: 400,
        message: 'collection, action, itemId, and userId are required',
      });
    }

    // Optional webhook secret validation
    const config = useRuntimeConfig();
    const webhookSecret = config.notificationWebhookSecret;
    if (webhookSecret && secret !== webhookSecret) {
      throw createError({
        statusCode: 403,
        message: 'Invalid webhook secret',
      });
    }

    // Use admin client to create notifications (this is a server-to-server call)
    const directus = getServerDirectus();

    // Resolve notification targets
    const targets = await resolveNotificationTargets(directus, {
      collection,
      action,
      item: item || {},
      itemId,
      userId,
      orgId,
    });

    if (targets.length === 0) {
      return { ok: true, sent: 0 };
    }

    // Create notifications for each target
    const results = await Promise.allSettled(
      targets.map((target) =>
        directus.request(
          createNotification({
            recipient: target.recipientId,
            sender: userId,
            subject: target.subject,
            message: target.message,
            collection: target.collection,
            item: target.itemId,
            status: 'inbox',
          }),
        ),
      ),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      console.warn(`[notifications/trigger] ${failed} notification(s) failed to send`);
    }

    return { ok: true, sent, failed };
  } catch (error: any) {
    console.error('[notifications/trigger] Error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to trigger notifications',
    });
  }
});
