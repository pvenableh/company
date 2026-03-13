// server/utils/notificationRecipients.ts
/**
 * Resolves which users should receive notifications for a given event.
 *
 * Handles:
 * - @mentions in text content
 * - Assignees on tickets, tasks, projects
 * - Org admins for invoice events
 * - Channel members for new messages
 * - Comment/reaction targets
 */

import { readItems, readItem } from '@directus/sdk';
import { parseMentions } from './mentionParser';

interface NotificationEvent {
  collection: string;
  action: 'create' | 'update' | 'delete';
  item: Record<string, any>;
  itemId: string;
  userId: string; // The user who triggered the event
  orgId?: string;
}

interface NotificationTarget {
  recipientId: string;
  subject: string;
  message: string;
  type: string; // mention, comment, reaction, status_change, assignment, message, invoice
  collection: string;
  itemId: string;
}

/**
 * Resolve notification targets for a given event.
 * Returns an array of notification targets (one per recipient).
 */
export async function resolveNotificationTargets(
  directus: any,
  event: NotificationEvent,
): Promise<NotificationTarget[]> {
  const targets: NotificationTarget[] = [];
  const { collection, action, item, itemId, userId } = event;

  try {
    switch (collection) {
      case 'comments': {
        // Notify mentioned users
        const mentions = parseMentions(item.content || item.comment);
        for (const mentionedId of mentions) {
          if (mentionedId !== userId) {
            targets.push({
              recipientId: mentionedId,
              subject: 'You were mentioned in a comment',
              message: truncateText(item.content || item.comment, 120),
              type: 'mention',
              collection: item.collection || collection,
              itemId: item.item || itemId,
            });
          }
        }

        // Notify assignees of the parent item if it's a ticket/project/task
        if (item.collection && item.item) {
          const parentRecipients = await getParentItemAssignees(directus, item.collection, item.item);
          for (const recipientId of parentRecipients) {
            if (recipientId !== userId && !mentions.includes(recipientId)) {
              targets.push({
                recipientId,
                subject: `New comment on ${formatCollectionName(item.collection)}`,
                message: truncateText(item.content || item.comment, 120),
                type: 'comment',
                collection: item.collection,
                itemId: item.item,
              });
            }
          }
        }
        break;
      }

      case 'messages': {
        // Notify mentioned users in channel messages
        const mentions = parseMentions(item.content);
        for (const mentionedId of mentions) {
          if (mentionedId !== userId) {
            targets.push({
              recipientId: mentionedId,
              subject: 'You were mentioned in a message',
              message: truncateText(item.content, 120),
              type: 'mention',
              collection,
              itemId,
            });
          }
        }

        // Notify channel members (if channel has a defined member list)
        if (item.channel) {
          const channelMembers = await getChannelMembers(directus, item.channel);
          for (const memberId of channelMembers) {
            if (memberId !== userId && !mentions.includes(memberId)) {
              targets.push({
                recipientId: memberId,
                subject: 'New message in channel',
                message: truncateText(item.content, 120),
                type: 'message',
                collection,
                itemId,
              });
            }
          }
        }
        break;
      }

      case 'reactions': {
        // Notify the author of the item that received a reaction
        if (item.item && item.collection) {
          const authorId = await getItemAuthor(directus, item.collection, item.item);
          if (authorId && authorId !== userId) {
            targets.push({
              recipientId: authorId,
              subject: `Someone reacted to your ${formatCollectionName(item.collection)}`,
              message: item.emoji || item.value || 'reacted',
              type: 'reaction',
              collection: item.collection,
              itemId: item.item,
            });
          }
        }
        break;
      }

      case 'tickets': {
        if (action === 'update' && item.status) {
          // Status change — notify assignees
          const assignees = await getItemAssignees(directus, collection, itemId);
          for (const recipientId of assignees) {
            if (recipientId !== userId) {
              targets.push({
                recipientId,
                subject: `Ticket status changed to ${formatStatus(item.status)}`,
                message: item.title || 'Ticket updated',
                type: 'status_change',
                collection,
                itemId,
              });
            }
          }
        }
        if (action === 'update' && item.assigned_to) {
          // Assignment change — notify the new assignee
          const newAssignee = typeof item.assigned_to === 'object' ? item.assigned_to.id : item.assigned_to;
          if (newAssignee && newAssignee !== userId) {
            targets.push({
              recipientId: newAssignee,
              subject: 'You were assigned to a ticket',
              message: item.title || 'New ticket assignment',
              type: 'assignment',
              collection,
              itemId,
            });
          }
        }
        break;
      }

      case 'project_tasks': {
        if (action === 'update' && item.status) {
          const assignees = await getItemAssignees(directus, collection, itemId);
          for (const recipientId of assignees) {
            if (recipientId !== userId) {
              targets.push({
                recipientId,
                subject: `Task status changed to ${formatStatus(item.status)}`,
                message: item.title || 'Task updated',
                type: 'status_change',
                collection,
                itemId,
              });
            }
          }
        }
        if (action === 'update' && item.assigned_to) {
          const newAssignee = typeof item.assigned_to === 'object' ? item.assigned_to.id : item.assigned_to;
          if (newAssignee && newAssignee !== userId) {
            targets.push({
              recipientId: newAssignee,
              subject: 'You were assigned to a task',
              message: item.title || 'New task assignment',
              type: 'assignment',
              collection,
              itemId,
            });
          }
        }
        break;
      }

      case 'invoices': {
        if (action === 'update' && item.status) {
          // Notify org admins on invoice status change
          if (event.orgId) {
            const admins = await getOrgAdmins(directus, event.orgId);
            for (const adminId of admins) {
              if (adminId !== userId) {
                targets.push({
                  recipientId: adminId,
                  subject: `Invoice status changed to ${formatStatus(item.status)}`,
                  message: item.invoice_number || item.title || 'Invoice updated',
                  type: 'invoice',
                  collection,
                  itemId,
                });
              }
            }
          }
        }
        break;
      }

      case 'project_events': {
        if (action === 'create' || action === 'update') {
          // Notify assigned team on project events
          if (item.project) {
            const projectId = typeof item.project === 'object' ? item.project.id : item.project;
            const assignees = await getItemAssignees(directus, 'projects', projectId);
            for (const recipientId of assignees) {
              if (recipientId !== userId) {
                targets.push({
                  recipientId,
                  subject: action === 'create' ? 'New project event' : 'Project event updated',
                  message: item.title || item.description || 'Project activity',
                  type: 'status_change',
                  collection: 'projects',
                  itemId: projectId,
                });
              }
            }
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[notificationRecipients] Error resolving targets for ${collection}:`, err);
  }

  return targets;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getItemAssignees(directus: any, collection: string, itemId: string): Promise<string[]> {
  try {
    const item = await directus.request(readItem(collection, itemId, {
      fields: ['assigned_to'],
    }));

    if (!item?.assigned_to) return [];

    // Handle both single user and array of users
    if (Array.isArray(item.assigned_to)) {
      return item.assigned_to.map((u: any) => typeof u === 'object' ? u.id : u).filter(Boolean);
    }

    const userId = typeof item.assigned_to === 'object' ? item.assigned_to.id : item.assigned_to;
    return userId ? [userId] : [];
  } catch {
    return [];
  }
}

async function getParentItemAssignees(directus: any, collection: string, itemId: string): Promise<string[]> {
  return getItemAssignees(directus, collection, itemId);
}

async function getChannelMembers(directus: any, channelId: string): Promise<string[]> {
  try {
    // Channels may have a members field or be accessible by all org members
    // For now, return empty — channel-level notification requires channel member tracking
    // This can be expanded when channel membership is explicit
    return [];
  } catch {
    return [];
  }
}

async function getItemAuthor(directus: any, collection: string, itemId: string): Promise<string | null> {
  try {
    const item = await directus.request(readItem(collection, itemId, {
      fields: ['user_created'],
    }));

    if (!item?.user_created) return null;
    return typeof item.user_created === 'object' ? item.user_created.id : item.user_created;
  } catch {
    return null;
  }
}

async function getOrgAdmins(directus: any, orgId: string): Promise<string[]> {
  try {
    const memberships = await directus.request(readItems('org_memberships', {
      filter: {
        _and: [
          { organization: { _eq: orgId } },
          { status: { _eq: 'active' } },
          { role: { slug: { _in: ['owner', 'admin'] } } },
        ],
      },
      fields: ['user'],
      limit: 50,
    }));

    return memberships
      .map((m: any) => typeof m.user === 'object' ? m.user.id : m.user)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  // Strip HTML tags
  const clean = text.replace(/<[^>]*>/g, '');
  if (clean.length <= maxLength) return clean;
  return clean.substring(0, maxLength) + '...';
}

function formatCollectionName(collection: string): string {
  const names: Record<string, string> = {
    tickets: 'ticket',
    projects: 'project',
    project_tasks: 'task',
    comments: 'comment',
    messages: 'message',
    invoices: 'invoice',
  };
  return names[collection] || collection;
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
