// POST /api/signup/draft
// Public, session-less. Persists an in-progress signup (password-at-end flow)
// into `signup_drafts`, keyed by an unguessable server-issued `token`.
//
//  - No token in body  -> create a new draft, return { token }.
//  - token in body      -> patch the existing ACTIVE draft's state/name/email.
//
// The collection has NO client permissions; all access is through this
// admin-token route. The only thing that protects a draft is its token, so we
// never return a list and never accept a client-supplied token for creation.
import { createItem, readItems, updateItem } from '@directus/sdk';
import { randomBytes } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Cap the serialized wizard state so the public endpoint can't be used to stuff
// large blobs into the table.
const MAX_STATE_BYTES = 32_000;

function sanitizeState(state: unknown): Record<string, any> | undefined {
  if (state == null) return undefined;
  if (typeof state !== 'object' || Array.isArray(state)) {
    throw createError({ statusCode: 400, message: 'Invalid state' });
  }
  if (JSON.stringify(state).length > MAX_STATE_BYTES) {
    throw createError({ statusCode: 413, message: 'Signup state too large' });
  }
  return state as Record<string, any>;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    token?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    state?: Record<string, any>;
  }>(event);

  const directus = getServerDirectus();
  const now = new Date().toISOString();
  const state = sanitizeState(body?.state);

  // ── Update an existing draft ──
  if (body?.token) {
    const rows = (await directus.request(
      readItems('signup_drafts', {
        filter: { token: { _eq: body.token } },
        fields: ['id', 'status'],
        limit: 1,
      }),
    )) as Array<{ id: number; status: string | null }>;
    const draft = rows[0];
    if (!draft) {
      throw createError({ statusCode: 404, message: 'Signup session not found' });
    }
    if (draft.status === 'completed') {
      throw createError({ statusCode: 410, message: 'This signup is already complete' });
    }

    const patch: Record<string, any> = { last_activity: now, status: 'active' };
    if (typeof body.email === 'string' && EMAIL_RE.test(body.email.trim())) patch.email = body.email.trim().toLowerCase();
    if (typeof body.first_name === 'string') patch.first_name = body.first_name.trim() || null;
    if (typeof body.last_name === 'string') patch.last_name = body.last_name.trim() || null;
    if (state !== undefined) patch.state = state;

    await directus.request(updateItem('signup_drafts', draft.id, patch));
    return { token: body.token, ok: true };
  }

  // ── Create a new draft ──
  const email = (body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, message: 'A valid email is required to start' });
  }

  const token = randomBytes(24).toString('hex'); // 48 hex chars, unguessable
  await directus.request(
    createItem('signup_drafts', {
      token,
      email,
      first_name: (body?.first_name || '').trim() || null,
      last_name: (body?.last_name || '').trim() || null,
      state: state ?? {},
      status: 'active',
      last_activity: now,
    }),
  );

  return { token, ok: true };
});
