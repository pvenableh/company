// server/api/portal/items.post.ts
/**
 * POST /api/portal/items
 *
 * Read-only proxy for client portal pages. Resolves the caller's portal
 * context (org + scoped client IDs via parent_client walk), then applies a
 * hard-coded scope filter per whitelisted collection on top of any caller
 * filter. Runs against the admin Directus token so portal-only users (who
 * have no `org_memberships` row, only `client_portal_users`) can read the
 * collections they're entitled to without us having to maintain row-level
 * Directus perms across ten collections.
 *
 * Mirrors the body shape of /api/directus/items so the call sites stay
 * symmetrical, but only `list`, `get`, `aggregate`, and `count` are
 * supported. Writes go through dedicated portal routes (e.g. /api/messages,
 * /api/portal/tickets create) — this proxy never mutates.
 */

import {
  readItems,
  readItem,
  aggregate as directusAggregate,
} from '@directus/sdk';
import { requirePortalContext, type PortalContext } from '~~/server/utils/portal-auth';

type Operation = 'list' | 'get' | 'aggregate' | 'count';

type CollectionScope = {
  /**
   * Build the scope filter conditions injected before any caller filter.
   * Returns the array of conditions to AND with caller filters.
   */
  scopeConditions: (ctx: PortalContext) => any[];
};

/**
 * Whitelist of portal-readable collections + their scope rules. Anything
 * not here is rejected. Keep in sync with the portal page set.
 *
 * Field-name notes (because schema is inconsistent):
 *  - `tickets`, `projects`, `contracts`, `clients`     → use `client` / `organization`
 *  - `tasks`                                           → uses `client_id` / `organization_id`
 *  - `project_events`                                  → no direct client; walk `project`
 *  - `proposals`                                       → no `client` FK; scope by org only
 *  - `marketing_campaigns`, `marketing_touches`        → scope by org (no client FK)
 *  - `channels`                                        → `client` direct, plus public
 *  - `messages`                                        → no org FK; walk `channel`
 *  - `directus_comments`/`reactions`                   → permitted, scoped by collection+item
 */
const COLLECTION_SCOPES: Record<string, CollectionScope> = {
  tickets: {
    scopeConditions: (ctx) => [
      { organization: { _eq: ctx.organizationId } },
      { client: { _in: ctx.scopedClientIds } },
    ],
  },
  projects: {
    scopeConditions: (ctx) => [
      { organization: { _eq: ctx.organizationId } },
      { client: { _in: ctx.scopedClientIds } },
    ],
  },
  tasks: {
    scopeConditions: (ctx) => [
      { organization_id: { _eq: ctx.organizationId } },
      { client_id: { _in: ctx.scopedClientIds } },
    ],
  },
  project_events: {
    scopeConditions: (ctx) => [
      { project: { organization: { _eq: ctx.organizationId } } },
      { project: { client: { _in: ctx.scopedClientIds } } },
    ],
  },
  project_tasks: {
    // ProjectTask has no direct org/client FKs. Walk via `project` (or
    // `event_id.project` as a fallback for tasks with no direct project link).
    scopeConditions: (ctx) => [
      {
        _or: [
          {
            _and: [
              { project: { organization: { _eq: ctx.organizationId } } },
              { project: { client: { _in: ctx.scopedClientIds } } },
            ],
          },
          {
            _and: [
              { event_id: { project: { organization: { _eq: ctx.organizationId } } } },
              { event_id: { project: { client: { _in: ctx.scopedClientIds } } } },
            ],
          },
        ],
      },
    ],
  },
  proposals: {
    // No client FK on proposals — scope by org. Pages already filter to
    // `proposal_status _nin draft` so the caller decides visibility.
    scopeConditions: (ctx) => [
      { organization: { _eq: ctx.organizationId } },
    ],
  },
  contracts: {
    scopeConditions: (ctx) => [
      { organization: { _eq: ctx.organizationId } },
      { client: { _in: ctx.scopedClientIds } },
    ],
  },
  marketing_campaigns: {
    // Campaigns have no `client` FK; scope by org. Per-client visibility
    // would need a touch-variant join — defer until we have a real
    // requirement.
    scopeConditions: (ctx) => [
      { organization: { _eq: ctx.organizationId } },
    ],
  },
  marketing_touches: {
    scopeConditions: (ctx) => [
      { organization: { _eq: ctx.organizationId } },
    ],
  },
  channels: {
    scopeConditions: (ctx) => [
      { organization: { _eq: ctx.organizationId } },
      { client: { _in: ctx.scopedClientIds } },
    ],
  },
  messages: {
    // Messages are scoped through `channel`, which is itself scoped above.
    scopeConditions: (ctx) => [
      { channel: { organization: { _eq: ctx.organizationId } } },
      { channel: { client: { _in: ctx.scopedClientIds } } },
    ],
  },
  clients: {
    // Allow reading the user's own client + descendants only.
    scopeConditions: (ctx) => [
      { organization: { _eq: ctx.organizationId } },
      { id: { _in: ctx.scopedClientIds } },
    ],
  },
};

function mergeFilter(scopeConditions: any[], callerFilter: any): any {
  if (!callerFilter || (typeof callerFilter === 'object' && Object.keys(callerFilter).length === 0)) {
    return scopeConditions.length === 0 ? undefined : { _and: scopeConditions };
  }
  return { _and: [...scopeConditions, callerFilter] };
}

const MAX_LIMIT = 200;

function clampLimit(limit: any): number | undefined {
  if (limit === undefined || limit === null) return undefined;
  if (typeof limit !== 'number') return undefined;
  if (limit === -1 || limit > MAX_LIMIT) return MAX_LIMIT;
  return limit;
}

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const body = await readBody(event);

  const collection = body?.collection as string | undefined;
  const operation = body?.operation as Operation | undefined;
  const callerQuery = body?.query ?? {};
  const callerId = body?.id;

  if (!collection || !operation) {
    throw createError({ statusCode: 400, message: 'collection and operation are required' });
  }

  const scope = COLLECTION_SCOPES[collection];
  if (!scope) {
    throw createError({
      statusCode: 403,
      message: `Collection "${collection}" is not readable from the client portal`,
    });
  }

  const directus = getServerDirectus();
  const scopeConditions = scope.scopeConditions(ctx);

  try {
    switch (operation) {
      case 'list': {
        const query: any = { ...callerQuery };
        query.filter = mergeFilter(scopeConditions, callerQuery.filter);
        const limit = clampLimit(callerQuery.limit);
        if (limit !== undefined) query.limit = limit;
        else if (query.limit === undefined) query.limit = 100;
        return await directus.request(readItems(collection as any, query));
      }

      case 'get': {
        if (!callerId) throw createError({ statusCode: 400, message: 'id required for get' });
        // Apply scope as a filter on a 1-row list rather than readItem,
        // so cross-tenant IDs return empty instead of leaking.
        const query: any = { ...callerQuery };
        query.filter = mergeFilter(
          [...scopeConditions, { id: { _eq: callerId } }],
          callerQuery.filter,
        );
        query.limit = 1;
        const rows = (await directus.request(readItems(collection as any, query))) as any[];
        if (!rows.length) {
          throw createError({ statusCode: 404, message: 'Not found' });
        }
        return rows[0];
      }

      case 'aggregate': {
        const filter = mergeFilter(scopeConditions, callerQuery.filter);
        return await directus.request(
          directusAggregate(collection as any, {
            aggregate: callerQuery.aggregate,
            groupBy: callerQuery.groupBy,
            query: { filter },
          }),
        );
      }

      case 'count': {
        const filter = mergeFilter(scopeConditions, callerQuery.filter);
        const result = (await directus.request(
          directusAggregate(collection as any, {
            aggregate: { count: ['*'] },
            query: { filter },
          }),
        )) as any[];
        return result?.[0]?.count ?? 0;
      }

      default:
        throw createError({
          statusCode: 400,
          message: `Operation "${operation}" not supported by /api/portal/items`,
        });
    }
  } catch (err: any) {
    if (err?.statusCode) throw err;
    console.error('[/api/portal/items] error:', {
      collection,
      operation,
      message: err?.message,
      errors: err?.errors,
    });
    throw createError({
      statusCode: 500,
      message: err?.message ?? 'Portal items request failed',
    });
  }
});
