/**
 * Org file-storage quota enforcement — mirrors the AI-token model
 * (server/utils/ai-token-enforcement.ts): a cached counter on the hot path,
 * plus a recompute that self-heals drift.
 *
 * Effective limit = EARNEST_PLANS[plan].storageBytes + organizations.storage_extra_bytes
 *   - 'enterprise' (and any unknown/comp plan) → UNLIMITED (null)
 *   - 'free' / null plan → FREE_STORAGE_BYTES floor
 * Usage is the cached `storage_used_bytes`, incremented on upload and
 * decremented on delete, and periodically corrected by recomputeOrgStorage().
 */
import { readFolders, readItem, updateItem } from '@directus/sdk';
import type { H3Event } from 'h3';
import { EARNEST_ADDONS, EARNEST_PLANS, GB } from './stripe';

/** Largest single file we accept, pre-quota. Tunable via env (MB). */
export const PER_FILE_CAP_BYTES = (Number(process.env.STORAGE_MAX_FILE_MB) || 250) * 1024 * 1024;

/** Storage for an org with no paid plan (free / null). */
const FREE_STORAGE_BYTES = 5 * GB;

const PLAN_STORAGE: Record<string, number> = {
  solo: EARNEST_PLANS.solo.storageBytes,
  studio: EARNEST_PLANS.studio.storageBytes,
  agency: EARNEST_PLANS.agency.storageBytes,
};

export interface OrgStorage {
  usedBytes: number;
  /** null = unlimited (enterprise/comp) */
  limitBytes: number | null;
  remainingBytes: number | null;
  plan: string | null;
}

/** Effective byte limit for a plan + purchased extra. null = unlimited. */
export function planStorageLimit(plan: string | null | undefined, extraBytes = 0): number | null {
  if (plan === 'enterprise') return null; // internal/comp — never capped
  const base = plan && plan in PLAN_STORAGE ? PLAN_STORAGE[plan] : FREE_STORAGE_BYTES;
  return base + Math.max(0, Number(extraBytes) || 0);
}

/** Read an org's current usage + effective limit (uses the cached counter). */
export async function getOrgStorage(organizationId: string): Promise<OrgStorage> {
  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem('organizations', organizationId, {
      fields: ['plan', 'storage_used_bytes', 'storage_extra_bytes', 'active_addons'],
    }),
  )) as any;

  // Extra storage = manual override field + any purchased extra_storage_100
  // add-on (active_addons is keyed by addonId; mirrors hasAddon()).
  const addons = org?.active_addons;
  const addonExtra = addons && typeof addons === 'object' && addons.extra_storage_100
    ? EARNEST_ADDONS.extra_storage_100.storageBytes
    : 0;
  const extraBytes = (Number(org?.storage_extra_bytes) || 0) + addonExtra;

  const usedBytes = Math.max(0, Number(org?.storage_used_bytes) || 0);
  const limitBytes = planStorageLimit(org?.plan, extraBytes);
  const remainingBytes = limitBytes == null ? null : Math.max(0, limitBytes - usedBytes);
  return { usedBytes, limitBytes, remainingBytes, plan: org?.plan ?? null };
}

/**
 * Throw before accepting an upload of `incomingBytes` if it would breach the
 * per-file cap (413) or the org's remaining quota (413). No-op when unlimited.
 */
export async function enforceStorageLimit(organizationId: string, incomingBytes: number): Promise<void> {
  if (incomingBytes > PER_FILE_CAP_BYTES) {
    throw createError({
      statusCode: 413,
      message: `That file is too large. The per-file limit is ${Math.round(PER_FILE_CAP_BYTES / (1024 * 1024))} MB.`,
    });
  }
  const { limitBytes, usedBytes } = await getOrgStorage(organizationId);
  if (limitBytes == null) return; // unlimited
  if (usedBytes + incomingBytes > limitBytes) {
    throw createError({
      statusCode: 413,
      data: { code: 'storage_full' },
      message: 'Your organization has run out of file storage. Free up space or add more storage.',
    });
  }
}

/** Adjust the cached counter after an upload (+) or delete (-). Never negative. */
export async function addOrgStorageUsage(organizationId: string, deltaBytes: number): Promise<void> {
  if (!deltaBytes) return;
  try {
    const directus = getTypedDirectus();
    const org = (await directus.request(
      readItem('organizations', organizationId, { fields: ['storage_used_bytes'] }),
    )) as any;
    const next = Math.max(0, (Number(org?.storage_used_bytes) || 0) + deltaBytes);
    await directus.request(updateItem('organizations', organizationId, { storage_used_bytes: next } as any));
  } catch (err) {
    console.error('[storage] failed to adjust usage:', (err as Error).message);
  }
}

/**
 * Authoritative recompute: sum filesize across every file under the org's
 * folder subtree, write it to the cached counter, and return the total. Used by
 * the usage meter (self-heals any drift from out-of-band uploads/deletes).
 */
/**
 * Sum the total bytes of every file under `rootFolder` (inclusive of all
 * descendant folders). Level-order BFS (one query per depth level) + chunked
 * aggregate sums. Shared by the org recompute and the on-demand folder-size UI.
 * Note: this is network-heavy against a remote Directus — call it on demand,
 * not eagerly for every folder.
 */
export async function sumFolderSubtree(rootFolder: string): Promise<number> {
  const directus = getTypedDirectus();

  const subtree: string[] = [rootFolder];
  let frontier: string[] = [rootFolder];
  while (frontier.length) {
    const children = (await directus.request(
      readFolders({ filter: { parent: { _in: frontier } }, fields: ['id'], limit: -1 }),
    )) as any[];
    const ids = (children || []).map((c) => c.id).filter(Boolean);
    if (!ids.length) break;
    subtree.push(...ids);
    frontier = ids;
  }

  // Aggregate sum via raw fetch — item commands on core directus_* collections
  // are unreliable through the SDK. Chunk the folder id list for the querystring.
  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = (config.directus as any)?.serverToken;
  let total = 0;
  for (let i = 0; i < subtree.length; i += 50) {
    const chunk = subtree.slice(i, i + 50);
    const params = new URLSearchParams({ 'aggregate[sum]': 'filesize' });
    chunk.forEach((id, idx) => params.set(`filter[folder][_in][${idx}]`, id));
    const res = await fetch(`${url}/files?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) continue;
    const j = await res.json();
    total += Number(j?.data?.[0]?.sum?.filesize) || 0;
  }
  return total;
}

export async function recomputeOrgStorage(organizationId: string): Promise<number> {
  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem('organizations', organizationId, { fields: ['folder'] }),
  )) as any;
  const rootFolder = org?.folder;
  if (!rootFolder) {
    await directus.request(updateItem('organizations', organizationId, { storage_used_bytes: 0 } as any));
    return 0;
  }

  const total = await sumFolderSubtree(rootFolder);
  await directus.request(updateItem('organizations', organizationId, { storage_used_bytes: total } as any));
  return total;
}
