/**
 * Cron-callable endpoint that hard-deletes organizations whose
 * `archived_at` is older than the retention window (90 days).
 *
 * Auth: cronSecret Bearer token OR admin user session — same convention
 * as /api/ai/notices/check.
 *
 * Dry-run is the default. Flip `ORG_CLEANUP_DRY_RUN=false` (or pass
 * `?force=true` from an admin session) to actually run the purge. The
 * dry-run defaults to true so the first week of cron firings just
 * reports candidates to the logs without destroying anything.
 *
 * Returns: { dryRun, candidates: number, purged: { orgId, totals, errors }[] }
 */
import { readItems } from '@directus/sdk';
import { purgeOrganization } from '~~/server/utils/purge-org';

const RETENTION_DAYS = 90;

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const body = method === 'POST' ? (await readBody(event).catch(() => ({})) || {}) : {};
  const force = (body as any)?.force === true || getQuery(event)?.force === 'true';

  // Auth: accept cronSecret or user session
  const authHeader = getHeader(event, 'authorization');
  const config = useRuntimeConfig();
  const cronSecret = (config as any).cronSecret || (config.public as any)?.cronSecret;

  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // Authenticated via cron secret
  } else {
    const session = await requireUserSession(event);
    const userId = (session as any).user?.id;
    if (!userId) {
      throw createError({ statusCode: 401, message: 'Authentication required' });
    }
    // Manual force runs require an explicit admin role on at least one org.
    if (force) {
      try {
        await requireOrgRole(event, ['owner', 'admin']);
      } catch {
        throw createError({ statusCode: 403, message: 'Force-purge requires owner/admin role' });
      }
    }
  }

  // Default to dry-run unless env var is explicitly 'false' or caller passed force=true.
  const dryRunEnv = (process.env.ORG_CLEANUP_DRY_RUN ?? 'true').toLowerCase();
  const dryRun = !force && dryRunEnv !== 'false';

  const directus = getServerDirectus();
  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const candidates = await directus.request(
    readItems('organizations', {
      filter: {
        _and: [
          { archived_at: { _nnull: true } },
          { archived_at: { _lt: cutoffIso } },
        ],
      },
      fields: ['id', 'name', 'archived_at'],
      limit: -1,
    }),
  ).catch(() => []) as Array<{ id: string; name: string; archived_at: string }>;

  console.log(
    `[cleanup-archived] dryRun=${dryRun} cutoff=${cutoffIso} candidates=${candidates.length}`,
  );

  if (dryRun) {
    return {
      dryRun: true,
      cutoff: cutoffIso,
      candidates: candidates.length,
      orgs: candidates.map((c) => ({ id: c.id, name: c.name, archived_at: c.archived_at })),
    };
  }

  const purged: any[] = [];
  for (const org of candidates) {
    console.log(`[cleanup-archived] purging org=${org.id} name="${org.name}" archived=${org.archived_at}`);
    const report = await purgeOrganization(org.id);
    purged.push(report);
  }

  return {
    dryRun: false,
    cutoff: cutoffIso,
    candidates: candidates.length,
    purged,
  };
});
