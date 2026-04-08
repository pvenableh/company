/**
 * Public endpoint to fetch event details by approval token.
 * No auth required — the token acts as the access credential.
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');

  if (!token) {
    throw createError({ statusCode: 400, message: 'Token is required' });
  }

  const directus = getTypedDirectus();

  const events = await directus.request(
    readItems('project_events', {
      filter: { approval_token: { _eq: token } },
      fields: [
        'id',
        'title',
        'description',
        'content',
        'type',
        'approval',
        'approved_at',
        'event_date',
        'end_date',
        'prototype_link',
        'link',
        'project.id',
        'project.title',
        'project.client.name',
        'project.organization.name',
      ],
      limit: 1,
    })
  );

  if (!events?.length) {
    throw createError({ statusCode: 404, message: 'Invalid or expired approval link' });
  }

  return events[0];
});
