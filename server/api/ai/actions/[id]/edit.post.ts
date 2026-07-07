// server/api/ai/actions/[id]/edit.post.ts
/**
 * Edit a PENDING ai_actions row before approval — lets the user adjust what
 * Earnest proposed (project/event/task titles + dates, invoice line items,
 * an email's subject/body, an update_field value, …) prior to running it.
 *
 * Same admin-client + requireOrgMembership auth as approve/reject; client-side
 * ai_actions perms are intentionally NOT relied upon. Only `payload`, `preview`,
 * and `title` are patchable — never action_type/organization/status. Safe by
 * construction: the executor re-validates everything on approve (org-verifies
 * ids, enforces the update_field allow-list, etc.), so an edited payload can't
 * escalate past what a fresh proposal could do.
 *
 * Guards: 404 if missing, 409 if not pending. Fire-hard 400 on bad body shape.
 */
import { readItem, updateItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Action id is required' });

  const body = (await readBody(event)) as { payload?: any; preview?: any; title?: string | null };
  if (body == null || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Request body is required' });
  }

  const directus = getTypedDirectus();
  const action = (await directus
    .request(readItem('ai_actions' as any, id, { fields: ['id', 'organization', 'action_type', 'status'] }))
    .catch(() => null)) as any;
  if (!action) throw createError({ statusCode: 404, message: 'Action not found' });

  const organizationId = typeof action.organization === 'object' ? action.organization?.id : action.organization;
  if (!organizationId) throw createError({ statusCode: 400, message: 'Action has no organization' });
  await requireOrgMembership(event, String(organizationId));

  if (action.status !== 'pending') {
    throw createError({ statusCode: 409, message: `Only pending actions can be edited (this one is ${action.status})` });
  }

  const patch: Record<string, any> = {};
  if (body.payload !== undefined) {
    if (body.payload === null || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      throw createError({ statusCode: 400, message: 'payload must be an object' });
    }
    patch.payload = body.payload;
  }
  if (body.preview !== undefined) {
    if (body.preview !== null && (typeof body.preview !== 'object' || Array.isArray(body.preview))) {
      throw createError({ statusCode: 400, message: 'preview must be an object' });
    }
    patch.preview = body.preview;
  }
  if (body.title !== undefined) {
    patch.title = body.title == null ? null : String(body.title).slice(0, 300);
  }
  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, message: 'Nothing to update' });
  }

  await directus.request(updateItem('ai_actions' as any, id, patch));

  return { id, updated: true, ...patch };
});
