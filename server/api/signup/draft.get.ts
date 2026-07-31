// GET /api/signup/draft?token=...
// Public, session-less. Resume an in-progress signup: returns the draft's saved
// email/name/state for the given token so the wizard can rehydrate (used on
// mount when a token is present, and by resume links in reminder emails).
//
// Only ever returns the single draft matching the exact (unguessable) token —
// never a list. Completed drafts return 410 so a stale resume link doesn't
// re-open a finished signup.
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const token = (getQuery(event).token as string | undefined)?.trim();
  if (!token) {
    throw createError({ statusCode: 400, message: 'Missing token' });
  }

  const directus = getServerDirectus();
  const rows = (await directus.request(
    readItems('signup_drafts', {
      filter: { token: { _eq: token } },
      fields: ['id', 'email', 'first_name', 'last_name', 'state', 'status'],
      limit: 1,
    }),
  )) as Array<{
    id: number;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    state: Record<string, any> | null;
    status: string | null;
  }>;

  const draft = rows[0];
  if (!draft) {
    throw createError({ statusCode: 404, message: 'Signup session not found' });
  }
  if (draft.status === 'completed') {
    throw createError({ statusCode: 410, message: 'This signup is already complete' });
  }

  return {
    email: draft.email,
    first_name: draft.first_name,
    last_name: draft.last_name,
    state: draft.state || {},
  };
});
