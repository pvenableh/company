/**
 * Batch Save Project Events & Tasks.
 *
 * Takes an array of approved events with nested tasks and creates them
 * in Directus as project_events and project_tasks records.
 */
import { createItem, readItem } from '@directus/sdk';
import type { SaveEventsRequest } from '~~/types/projects/timeline-generator';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody<SaveEventsRequest>(event);
  if (!body.projectId) {
    throw createError({ statusCode: 400, message: 'Project ID is required' });
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    throw createError({ statusCode: 400, message: 'At least one event is required' });
  }

  const directus = await getUserDirectus(event);

  // Verify project exists
  try {
    await directus.request(readItem('projects', body.projectId, { fields: ['id'] }));
  } catch {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }

  const eventIds: string[] = [];
  let tasksCreated = 0;
  let previousEventId: string | null = null;

  try {
    for (const evt of body.events) {
      // Create the event
      const created = await directus.request(
        createItem('project_events', {
          project: body.projectId,
          title: evt.title,
          description: evt.description,
          event_date: evt.event_date,
          date: evt.event_date,
          end_date: evt.end_date,
          duration_days: evt.duration_days,
          type: evt.type,
          is_milestone: evt.is_milestone,
          sort: evt.sort,
          status: 'Scheduled',
          priority: 'Normal',
          depends_on: previousEventId,
        }),
      ) as { id: string };

      eventIds.push(created.id);
      previousEventId = created.id;

      // Create tasks for this event
      if (evt.tasks && evt.tasks.length > 0) {
        for (const task of evt.tasks) {
          await directus.request(
            createItem('project_tasks', {
              event_id: created.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              due_date: task.due_date,
              status: 'published',
              completed: false,
            }),
          );
          tasksCreated++;
        }
      }
    }

    return {
      eventsCreated: eventIds.length,
      tasksCreated,
      eventIds,
    };
  } catch (error: any) {
    console.error('[save-events] Error creating events:', error);
    throw createError({
      statusCode: 500,
      message: `Failed to save events. Created ${eventIds.length} of ${body.events.length} events before error.`,
    });
  }
});
