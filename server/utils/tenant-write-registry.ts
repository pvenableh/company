/**
 * Tenant write registry — single source of truth for gating tenant-scoped
 * WRITES (create / update / delete) through the app-level org_roles matrix.
 *
 * Why this exists
 * ───────────────
 * The app historically had TWO divergent permission layers:
 *   1. The app-level org_roles matrix (shared/permissions.ts + requireOrgPermission)
 *      — complete, correct, owner/admin/manager/member/client × 25 features.
 *   2. Directus collection permissions — incomplete + inconsistent, and per
 *      scripts/patch-tenant-write-perms.ts, Directus 11 does NOT enforce
 *      create-action FK-walk filters at insert time. So the non-admin
 *      "Client Manager" role (every real new owner + invited member) lacked
 *      create on core collections (contacts, invoices, proposals, leads,
 *      clients) → those creates 404'd for everyone except Administrators.
 *
 * The unification: route tenant writes through ONE gate that consults the
 * app-level matrix (the source of truth) and executes with the service token.
 * `requireOrgPermission` already does owner/admin bypass + matrix lookup, so
 * a new org OWNER (owner role) can create everything, a MANAGER gets its
 * matrix subset, etc. — regardless of Directus collection perms.
 *
 * Safety model (this file governs writes executed on the SERVICE TOKEN, which
 * bypasses Directus row filters — so the checks here ARE the isolation):
 *   • create: the target org is resolved from the payload (direct org field,
 *     or a parent ref's org, or an explicit orgContext) and MUST be an org the
 *     user is an active member of — enforced by requireOrgPermission, which
 *     403s if there's no membership. For direct-org collections we then STAMP
 *     the org field server-side so it can't be spoofed to another tenant.
 *   • update / delete: we re-read the existing row with the service token,
 *     derive its org, and gate on THAT — so a user can never mutate a row that
 *     belongs to an org they aren't in.
 *
 * Collections NOT listed here fall through to the legacy user-token proxy
 * (unchanged behavior) — this registry is opt-in, so adding the core tenant
 * collections fixes them without risking regressions elsewhere. Expanding
 * coverage to the remaining tenant collections is a mechanical follow-up.
 */
import { readItem } from '@directus/sdk';
import type { FeatureKey } from '~~/shared/permissions';

/** How to find the owning organization id for a row in this collection. */
type OrgResolution =
  // org id lives directly on the row (create: read from payload; update/delete: read from row)
  | { kind: 'direct'; field: string }
  // org id is reached through a single parent FK: row[field] -> parent[parentOrgField]
  | { kind: 'parent'; field: string; parent: string; parentOrgField?: string }
  // no org on the row itself (e.g. M2M-scoped contacts). create: use body.orgContext
  // (falling back to a parent ref or the user's sole membership). update/delete:
  // resolve via the M2M junction.
  | {
      kind: 'context';
      // optional parent ref that also implies org (e.g. contacts.client -> client.organization)
      parentField?: string;
      parent?: string;
      parentOrgField?: string;
      // junction used to resolve org on update/delete: junction[selfField] == row.id -> junction[orgField]
      junction?: { collection: string; selfField: string; orgField: string };
    };

export interface RegistryEntry {
  feature: FeatureKey;
  org: OrgResolution;
}

/**
 * The registry. Keyed by collection name. Feature keys map to shared/permissions.ts.
 * Org fields verified against the live prod schema.
 */
export const TENANT_WRITE_REGISTRY: Record<string, RegistryEntry> = {
  // ── Core collections that were BROKEN for non-admins (the reason for this) ──
  // These have NO Directus create grant for the Client Manager role, so every
  // real new owner / invited manager hit 404 creating them. Routing them
  // through the matrix fixes that (owner/admin bypass; manager per matrix).
  contacts: {
    feature: 'contacts',
    org: {
      kind: 'context',
      parentField: 'client',
      parent: 'clients',
      parentOrgField: 'organization',
      junction: { collection: 'contacts_organizations', selfField: 'contacts_id', orgField: 'organizations_id' },
    },
  },
  clients: { feature: 'clients', org: { kind: 'direct', field: 'organization' } },
  leads: { feature: 'leads', org: { kind: 'direct', field: 'organization' } },
  proposals: { feature: 'proposals', org: { kind: 'direct', field: 'organization' } },
  invoices: { feature: 'invoices', org: { kind: 'parent', field: 'client', parent: 'clients', parentOrgField: 'organization' } },
  invoice_items: {
    feature: 'invoices',
    // invoice_items -> invoice -> client -> organization (two-hop).
    org: { kind: 'parent', field: 'invoice', parent: 'invoices', parentOrgField: 'client.organization' },
  },

  // ── Working collections, now unified onto the matrix ──
  // These already functioned via the broad Client policy, so the matrix was
  // NOT actually being enforced on them. Enabling them here makes the app-level
  // matrix authoritative (owner/admin bypass; manager/member/client per matrix).
  // NOTE this TIGHTENS some roles vs. the old over-broad Client policy — e.g.
  // member loses project create/delete, manager loses team create/delete,
  // member loses mailing_list create, and member loses delete on
  // tickets/channels/touchpoints/expenses. The client already gates most create
  // controls via useOrgRole.canCreate (same matrix + same owner/admin bypass),
  // so gated buttons simply don't show for those roles; any UNGATED control is
  // a pre-existing matrix hole and gets a client guard added alongside this.
  projects: { feature: 'projects', org: { kind: 'direct', field: 'organization' } },
  // Per-org event categories (colored labels on the Gantt). Managed from org
  // Settings; gated on the `projects` feature so owner/admin/manager can curate
  // them, and org-stamped automatically on create.
  project_event_categories: { feature: 'projects', org: { kind: 'direct', field: 'organization' } },
  tickets: { feature: 'tickets', org: { kind: 'direct', field: 'organization' } },
  tasks: { feature: 'tasks', org: { kind: 'direct', field: 'organization_id' } },
  channels: { feature: 'channels', org: { kind: 'direct', field: 'organization' } },
  touchpoints: { feature: 'touchpoints', org: { kind: 'direct', field: 'organization' } },
  expenses: { feature: 'expenses', org: { kind: 'direct', field: 'organization' } },
  teams: { feature: 'team_management', org: { kind: 'direct', field: 'organization' } },
  mailing_lists: { feature: 'mailing_lists', org: { kind: 'direct', field: 'organization' } },
  mailing_list_contacts: {
    feature: 'mailing_lists',
    org: { kind: 'parent', field: 'list_id', parent: 'mailing_lists', parentOrgField: 'organization' },
  },
};

export function getRegistryEntry(collection: string): RegistryEntry | undefined {
  return TENANT_WRITE_REGISTRY[collection];
}

/**
 * Read a possibly-dotted field path off an object fetched with `fields: [path]`.
 * Directus returns nested relations as nested objects, so `client.organization`
 * comes back as `{ client: { organization: 'org-id' } }`.
 */
function readPath(row: any, path: string): string | undefined {
  const val = path.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), row);
  if (val == null) return undefined;
  // Relations may resolve to an object ({ id }) or a scalar id.
  return typeof val === 'object' ? (val.id ?? undefined) : String(val);
}

/**
 * Resolve the owning org id for a write, using the SERVICE token to read any
 * parent rows / junctions. Returns null when the org can't be determined
 * (caller decides whether that's a 400 or a fallback).
 *
 * @param userOrgIds active org memberships of the caller — used as the
 *   fallback org when a create payload carries no org and the user belongs to
 *   exactly one org, and as the membership set for junction/M2M resolution.
 */
export async function resolveWriteOrg(opts: {
  entry: RegistryEntry;
  collection: string;
  operation: 'create' | 'update' | 'delete';
  id?: string | number;
  data?: Record<string, any>;
  orgContext?: string;
  userOrgIds: string[];
}): Promise<string | null> {
  const { entry, operation, id, data, orgContext, userOrgIds } = opts;
  const directus = getServerDirectus();
  const org = entry.org;

  // ── CREATE: derive the target org from the incoming payload ──
  if (operation === 'create') {
    if (org.kind === 'direct') {
      const v = data?.[org.field];
      const orgId = typeof v === 'object' ? v?.id : v;
      if (orgId) return String(orgId);
    } else if (org.kind === 'parent') {
      const parentId = data?.[org.field];
      const pid = typeof parentId === 'object' ? parentId?.id : parentId;
      if (pid) {
        const parentField = org.parentOrgField || 'organization';
        const parent = await directus
          .request(readItem(org.parent as any, pid, { fields: [parentField] }))
          .catch(() => null);
        const resolved = parent ? readPath(parent, parentField) : undefined;
        if (resolved) return resolved;
      }
    } else if (org.kind === 'context') {
      if (orgContext) return String(orgContext);
      // fall back to a parent ref if the payload has one (e.g. contacts.client)
      if (org.parentField && data?.[org.parentField]) {
        const pid = typeof data[org.parentField] === 'object' ? data[org.parentField]?.id : data[org.parentField];
        if (pid) {
          const parentField = org.parentOrgField || 'organization';
          const parent = await directus
            .request(readItem(org.parent as any, pid, { fields: [parentField] }))
            .catch(() => null);
          const resolved = parent ? readPath(parent, parentField) : undefined;
          if (resolved) return resolved;
        }
      }
    }
    // Last-resort fallback: user belongs to exactly one org.
    if (userOrgIds.length === 1) return userOrgIds[0];
    return null;
  }

  // ── UPDATE / DELETE: derive org from the EXISTING row ──
  if (id == null) return null;

  if (org.kind === 'direct') {
    const row = await directus
      .request(readItem(opts.collection as any, id, { fields: [org.field] }))
      .catch(() => null);
    return row ? readPath(row, org.field) ?? null : null;
  }
  if (org.kind === 'parent') {
    const path = `${org.field}.${org.parentOrgField || 'organization'}`;
    const row = await directus
      .request(readItem(opts.collection as any, id, { fields: [path] }))
      .catch(() => null);
    return row ? readPath(row, path) ?? null : null;
  }
  // context / M2M (e.g. contacts): resolve via the junction, then pick an org
  // the caller is in.
  if (org.kind === 'context') {
    if (org.junction) {
      const { readItems } = await import('@directus/sdk');
      const rows = (await directus
        .request(
          readItems(org.junction.collection as any, {
            filter: { [org.junction.selfField]: { _eq: id } } as any,
            fields: [org.junction.orgField],
            limit: -1,
          }),
        )
        .catch(() => [])) as any[];
      const orgIds = rows.map((r) => readPath(r, org.junction!.orgField)).filter(Boolean) as string[];
      // Prefer an org the caller is actually a member of.
      const inCommon = orgIds.find((o) => userOrgIds.includes(o));
      if (inCommon) return inCommon;
      if (orgIds.length) return orgIds[0];
    }
    // Junction empty (orphan row with no org link). Try a parent ref on the
    // row itself (e.g. contacts.client -> client.organization).
    if (org.parentField) {
      const path = `${org.parentField}.${org.parentOrgField || 'organization'}`;
      const row = await directus
        .request(readItem(opts.collection as any, id, { fields: [path] }))
        .catch(() => null);
      const viaParent = row ? readPath(row, path) : undefined;
      if (viaParent) return viaParent;
    }
    // Last resort: an org-less row (no tenant binding) can only belong to the
    // caller's org when they have exactly one — safe because there's no other
    // tenant it could leak from.
    if (userOrgIds.length === 1) return userOrgIds[0];
  }
  return null;
}

/**
 * For direct-org CREATE, stamp the resolved org onto the payload so a caller
 * can't insert a row bound to a different tenant than the one they were gated
 * against. No-op for parent/context kinds (org isn't a direct column there).
 */
export function stampOrgOnCreate(entry: RegistryEntry, data: Record<string, any>, orgId: string): Record<string, any> {
  if (entry.org.kind === 'direct') {
    return { ...data, [entry.org.field]: orgId };
  }
  return data;
}
