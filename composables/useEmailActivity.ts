// composables/useEmailActivity.ts
/**
 * Composable for fetching and aggregating email activity data.
 *
 * Provides methods to:
 * - Fetch activity for a specific email (by SendGrid message ID)
 * - Fetch activity for a specific recipient
 * - Get aggregate stats (open rate, click rate, bounce rate) for campaigns
 */

export interface EmailActivityEvent {
  id: string;
  email_id: string | null;
  recipient: string;
  event: string;
  timestamp: string;
  send_collection: string | null;
  send_id: string | null;
  organization: string | null;
  metadata: Record<string, any> | null;
  date_created: string;
}

export interface EmailActivityStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  dropped: number;
  spam: number;
  openRate: number;  // percentage
  clickRate: number; // percentage
  bounceRate: number;
}

export function useEmailActivity() {
  const activityItems = useDirectusItems<EmailActivityEvent>('email_activity');
  const { getOrganizationFilter } = useOrganization();

  /**
   * Fetch activity events for a specific email by SendGrid message ID.
   */
  async function getActivityByEmailId(emailId: string): Promise<EmailActivityEvent[]> {
    return activityItems.list({
      filter: {
        _and: [
          { email_id: { _eq: emailId } },
          getOrganizationFilter(),
        ],
      },
      fields: ['id', 'email_id', 'recipient', 'event', 'timestamp', 'metadata', 'date_created'],
      sort: ['timestamp'],
      limit: 500,
    });
  }

  /**
   * Fetch activity events for a specific recipient email address.
   */
  async function getActivityByRecipient(recipientEmail: string): Promise<EmailActivityEvent[]> {
    return activityItems.list({
      filter: {
        _and: [
          { recipient: { _eq: recipientEmail } },
          getOrganizationFilter(),
        ],
      },
      fields: ['id', 'email_id', 'recipient', 'event', 'timestamp', 'send_collection', 'send_id', 'date_created'],
      sort: ['-timestamp'],
      limit: 100,
    });
  }

  /**
   * Fetch activity events for a specific send (e.g., a newsletter campaign).
   */
  async function getActivityBySend(sendCollection: string, sendId: string): Promise<EmailActivityEvent[]> {
    return activityItems.list({
      filter: {
        _and: [
          { send_collection: { _eq: sendCollection } },
          { send_id: { _eq: sendId } },
          getOrganizationFilter(),
        ],
      },
      fields: ['id', 'recipient', 'event', 'timestamp', 'metadata', 'date_created'],
      sort: ['timestamp'],
      limit: 500,
    });
  }

  /**
   * Get aggregate stats for a specific send (campaign).
   * Returns counts and rates for key events.
   */
  async function getStatsForSend(sendCollection: string, sendId: string): Promise<EmailActivityStats> {
    const events = await getActivityBySend(sendCollection, sendId);

    const counts: Record<string, number> = {
      processed: 0,
      delivered: 0,
      open: 0,
      click: 0,
      bounce: 0,
      dropped: 0,
      spamreport: 0,
    };

    // Count unique recipients per event type
    const uniqueByEvent: Record<string, Set<string>> = {};
    for (const event of events) {
      const type = event.event;
      if (!uniqueByEvent[type]) uniqueByEvent[type] = new Set();
      uniqueByEvent[type].add(event.recipient);
      counts[type] = (counts[type] || 0) + 1;
    }

    const delivered = uniqueByEvent['delivered']?.size || 0;
    const opened = uniqueByEvent['open']?.size || 0;
    const clicked = uniqueByEvent['click']?.size || 0;
    const bounced = uniqueByEvent['bounce']?.size || 0;

    return {
      sent: delivered + bounced + (uniqueByEvent['dropped']?.size || 0),
      delivered,
      opened,
      clicked,
      bounced,
      dropped: uniqueByEvent['dropped']?.size || 0,
      spam: uniqueByEvent['spamreport']?.size || 0,
      openRate: delivered > 0 ? Math.round((opened / delivered) * 100) : 0,
      clickRate: delivered > 0 ? Math.round((clicked / delivered) * 100) : 0,
      bounceRate: (delivered + bounced) > 0 ? Math.round((bounced / (delivered + bounced)) * 100) : 0,
    };
  }

  /**
   * Get a quick count of events by type for a send.
   * Uses aggregate query for efficiency.
   */
  async function getEventCounts(sendCollection: string, sendId: string): Promise<Record<string, number>> {
    try {
      const results = await activityItems.aggregate({
        aggregate: { count: ['id'] },
        groupBy: ['event'],
        filter: {
          _and: [
            { send_collection: { _eq: sendCollection } },
            { send_id: { _eq: sendId } },
          ],
        },
      }) as any[];

      const counts: Record<string, number> = {};
      for (const row of results) {
        counts[row.event] = parseInt(row.count?.id || row.count || 0);
      }
      return counts;
    } catch {
      return {};
    }
  }

  return {
    getActivityByEmailId,
    getActivityByRecipient,
    getActivityBySend,
    getStatsForSend,
    getEventCounts,
  };
}
