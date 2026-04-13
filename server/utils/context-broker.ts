/**
 * Context Broker — Pre-builds and caches org-level AI context snapshots.
 *
 * Three-tier caching with stale-while-revalidate:
 *   L1: In-memory Map (5 min TTL)
 *   L2: Directus ai_context_snapshots collection (30 min TTL)
 *   L3: Live Directus queries (fallback)
 *
 * Org-level context (clients, projects, invoices, deals, brand) is shared
 * across all users in the org. User-level context (tasks) is excluded —
 * it stays per-request in chat.post.ts.
 */

import { readItems, readItem, createItem, updateItem } from '@directus/sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CachedOrgContext {
  clientsSummary: string;
  projectsSummary: string;
  invoicesSummary: string;
  dealsSummary: string;
  brandSummary: string;
  tokenEstimate: number;
  builtAt: number;
  expiresAt: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const L1_TTL_MS = 5 * 60 * 1000;        // 5 minutes
const L2_TTL_MS = 30 * 60 * 1000;       // 30 minutes
const SCOPE_TOKEN_BUDGET = 500;          // ~500 tokens per scope

// ─── In-Memory Cache (L1) ────────────────────────────────────────────────────

const inMemoryCache = new Map<string, CachedOrgContext>();
const rebuildInProgress = new Set<string>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get org context from the tiered cache. Returns cached data when available,
 * falls back to live queries. Uses stale-while-revalidate for expired L1 data.
 */
export async function getOrgContext(organizationId: string): Promise<CachedOrgContext> {
  const cacheKey = `org:${organizationId}`;
  const cached = inMemoryCache.get(cacheKey);

  if (cached) {
    if (cached.expiresAt > Date.now()) {
      // L1 fresh hit
      return cached;
    }
    // L1 stale — return immediately, trigger background rebuild
    if (!rebuildInProgress.has(organizationId)) {
      triggerBackgroundRebuild(organizationId);
    }
    return cached;
  }

  // L1 miss — check L2 (Directus snapshot)
  try {
    const snapshot = await readFromL2(organizationId);
    if (snapshot) {
      inMemoryCache.set(cacheKey, snapshot);
      return snapshot;
    }
  } catch (err: any) {
    console.warn('[context-broker] L2 read failed:', err.message);
  }

  // L2 miss — synchronous L3 rebuild (first request for this org)
  return await rebuildOrgContext(organizationId);
}

/**
 * Force-rebuild an org's context snapshot. Writes to both L1 and L2.
 */
export async function rebuildOrgContext(organizationId: string): Promise<CachedOrgContext> {
  const directus = getTypedDirectus();
  const orgFilter = { organization: { _eq: organizationId } };
  const now = new Date();

  // Run all 5 scope builders in parallel
  const [clientsSummary, projectsSummary, invoicesSummary, dealsSummary, brandSummary] = await Promise.all([
    buildClientsSummary(directus, orgFilter, now),
    buildProjectsSummary(directus, orgFilter, now),
    buildInvoicesSummary(directus, orgFilter, now),
    buildDealsSummary(directus, orgFilter, now),
    buildBrandSummary(directus, organizationId),
  ]);

  const allText = [clientsSummary, projectsSummary, invoicesSummary, dealsSummary, brandSummary].join('');
  const tokenEstimate = Math.ceil(allText.length / 4);

  const context: CachedOrgContext = {
    clientsSummary,
    projectsSummary,
    invoicesSummary,
    dealsSummary,
    brandSummary,
    tokenEstimate,
    builtAt: Date.now(),
    expiresAt: Date.now() + L1_TTL_MS,
  };

  // Write to L1
  inMemoryCache.set(`org:${organizationId}`, context);

  // Write to L2 (fire-and-forget)
  writeToL2(organizationId, context).catch((err) => {
    console.warn('[context-broker] L2 write failed:', err.message);
  });

  return context;
}

/**
 * Clear in-memory cache for an org. Next request will check L2 or rebuild.
 */
export function invalidateOrgCache(organizationId: string): void {
  inMemoryCache.delete(`org:${organizationId}`);
}

// ─── Background Rebuild ──────────────────────────────────────────────────────

function triggerBackgroundRebuild(organizationId: string): void {
  rebuildInProgress.add(organizationId);
  rebuildOrgContext(organizationId)
    .catch((err) => console.error(`[context-broker] Background rebuild failed for org ${organizationId}:`, err.message))
    .finally(() => rebuildInProgress.delete(organizationId));
}

// ─── L2: Directus Snapshot Read/Write ────────────────────────────────────────

async function readFromL2(organizationId: string): Promise<CachedOrgContext | null> {
  const directus = getTypedDirectus();

  const rows = await directus.request(
    readItems('ai_context_snapshots', {
      filter: {
        _and: [
          { organization: { _eq: organizationId } },
          { context_type: { _eq: 'full' } },
          { expires_at: { _gt: new Date().toISOString() } },
        ],
      },
      fields: ['id', 'data', 'token_estimate', 'date_created', 'expires_at'],
      limit: 1,
    }),
  ) as any[];

  const row = rows?.[0];
  if (!row?.data) return null;

  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return {
    clientsSummary: data.clientsSummary || '',
    projectsSummary: data.projectsSummary || '',
    invoicesSummary: data.invoicesSummary || '',
    dealsSummary: data.dealsSummary || '',
    brandSummary: data.brandSummary || '',
    tokenEstimate: row.token_estimate || 0,
    builtAt: new Date(row.date_created).getTime(),
    expiresAt: Date.now() + L1_TTL_MS, // Reset L1 TTL from L2 read
  };
}

async function writeToL2(organizationId: string, context: CachedOrgContext): Promise<void> {
  const directus = getTypedDirectus();
  const expiresAt = new Date(Date.now() + L2_TTL_MS).toISOString();

  const data = {
    clientsSummary: context.clientsSummary,
    projectsSummary: context.projectsSummary,
    invoicesSummary: context.invoicesSummary,
    dealsSummary: context.dealsSummary,
    brandSummary: context.brandSummary,
  };

  // Upsert: check for existing row, update or create
  const existing = await directus.request(
    readItems('ai_context_snapshots', {
      filter: {
        _and: [
          { organization: { _eq: organizationId } },
          { context_type: { _eq: 'full' } },
        ],
      },
      fields: ['id'],
      limit: 1,
    }),
  ) as any[];

  if (existing?.[0]?.id) {
    await directus.request(
      updateItem('ai_context_snapshots', existing[0].id, {
        data,
        token_estimate: context.tokenEstimate,
        expires_at: expiresAt,
      }),
    );
  } else {
    await directus.request(
      createItem('ai_context_snapshots', {
        organization: organizationId,
        context_type: 'full',
        data,
        token_estimate: context.tokenEstimate,
        expires_at: expiresAt,
      }),
    );
  }
}

// ─── Token Budget Helper ─────────────────────────────────────────────────────

function truncateToTokenBudget(text: string, maxTokens: number = SCOPE_TOKEN_BUDGET): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '\n[...truncated]';
}

// ─── Scope Builders (extracted from chat.post.ts) ────────────────────────────

async function buildClientsSummary(directus: any, orgFilter: any, now: Date): Promise<string> {
  try {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const clients = await directus.request(
      readItems('clients', {
        filter: { ...orgFilter, status: { _eq: 'active' } },
        fields: ['id', 'name', 'status', 'date_updated', 'industry'],
        sort: ['-date_updated'],
        limit: 15,
      }),
    ) as Array<{ id: string; name: string; status: string; date_updated: string; industry: string }>;

    if (clients.length === 0) return '';

    const stale = clients.filter(c => c.date_updated && new Date(c.date_updated) < new Date(fourteenDaysAgo));
    const lines = clients.slice(0, 10).map((c) => {
      const isStale = stale.some(s => s.id === c.id);
      const daysAgo = c.date_updated ? Math.floor((now.getTime() - new Date(c.date_updated).getTime()) / (1000 * 60 * 60 * 24)) : null;
      return `- ${c.name}${c.industry ? ` (${c.industry})` : ''}${daysAgo !== null ? ` — last activity ${daysAgo}d ago` : ''}${isStale ? ' ⚠ STALE' : ''}`;
    });

    const result = `${clients.length} active clients${stale.length > 0 ? ` (${stale.length} with no activity in 14+ days)` : ''}:\n${lines.join('\n')}`;
    return truncateToTokenBudget(result);
  } catch { return ''; }
}

async function buildProjectsSummary(directus: any, orgFilter: any, now: Date): Promise<string> {
  try {
    const projects = await directus.request(
      readItems('projects', {
        filter: {
          ...orgFilter,
          status: { _in: ['Pending', 'Scheduled', 'In Progress'] },
        },
        fields: ['id', 'title', 'status', 'due_date', 'client.name', 'contract_value'],
        sort: ['due_date'],
        limit: 15,
      }),
    ) as Array<{ id: string; title: string; status: string; due_date: string; client: { name: string } | null; contract_value: number }>;

    if (projects.length === 0) return '';

    const overdue = projects.filter(p => p.due_date && new Date(p.due_date) < now);
    const lines = projects.slice(0, 10).map((p) => {
      const clientName = (p.client as any)?.name;
      const isOverdue = p.due_date && new Date(p.due_date) < now;
      const daysUntil = p.due_date ? Math.ceil((new Date(p.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
      return `- ${p.title}${clientName ? ` (${clientName})` : ''} — ${p.status}${p.due_date ? `, due ${p.due_date}` : ''}${isOverdue ? ' ⚠ OVERDUE' : daysUntil !== null && daysUntil <= 7 ? ` (${daysUntil}d left)` : ''}${p.contract_value ? ` [$${p.contract_value.toLocaleString()}]` : ''}`;
    });

    const result = `${projects.length} active projects${overdue.length > 0 ? ` (${overdue.length} overdue)` : ''}:\n${lines.join('\n')}`;
    return truncateToTokenBudget(result);
  } catch { return ''; }
}

async function buildInvoicesSummary(directus: any, orgFilter: any, now: Date): Promise<string> {
  try {
    const invoices = await directus.request(
      readItems('invoices', {
        filter: {
          ...orgFilter,
          status: { _in: ['pending', 'processing'] },
        },
        fields: ['id', 'status', 'total_amount', 'due_date', 'client.name', 'invoice_code'],
        sort: ['due_date'],
        limit: 20,
      }),
    ) as Array<{ id: string; status: string; total_amount: number; due_date: string; client: { name: string } | null; invoice_code: string }>;

    if (invoices.length === 0) return 'No outstanding invoices.';

    const overdue = invoices.filter(i => i.due_date && new Date(i.due_date) < now);
    const overdueTotal = overdue.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const pendingTotal = invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);

    const lines: string[] = [];
    lines.push(`${invoices.length} outstanding invoices totaling $${pendingTotal.toLocaleString()}`);
    if (overdue.length > 0) {
      lines.push(`⚠ ${overdue.length} OVERDUE totaling $${overdueTotal.toLocaleString()}:`);
      overdue.slice(0, 5).forEach((i) => {
        const clientName = (i.client as any)?.name;
        const daysOverdue = Math.floor((now.getTime() - new Date(i.due_date).getTime()) / (1000 * 60 * 60 * 24));
        lines.push(`  - ${i.invoice_code || 'Invoice'} — $${(i.total_amount || 0).toLocaleString()}${clientName ? ` from ${clientName}` : ''} (${daysOverdue}d overdue)`);
      });
    }

    return truncateToTokenBudget(lines.join('\n'));
  } catch { return ''; }
}

async function buildDealsSummary(directus: any, orgFilter: any, now: Date): Promise<string> {
  try {
    const leads = await directus.request(
      readItems('leads', {
        filter: {
          ...orgFilter,
          status: { _eq: 'published' },
          stage: { _nin: ['won', 'lost'] },
        },
        fields: ['id', 'stage', 'estimated_value', 'related_contact.first_name', 'related_contact.last_name', 'next_follow_up', 'priority', 'project_type'],
        sort: ['-estimated_value'],
        limit: 10,
      }),
    ) as Array<{ id: string; stage: string; estimated_value: number; related_contact: { first_name: string; last_name: string } | null; next_follow_up: string; priority: string; project_type: string }>;

    if (leads.length === 0) return '';

    const pipelineValue = leads.reduce((sum, l) => sum + (l.estimated_value || 0), 0);
    const staleLeads = leads.filter(l => l.next_follow_up && new Date(l.next_follow_up) < now);
    const lines = leads.slice(0, 8).map((l) => {
      const contactName = l.related_contact ? `${(l.related_contact as any).first_name || ''} ${(l.related_contact as any).last_name || ''}`.trim() : '';
      const isStale = l.next_follow_up && new Date(l.next_follow_up) < now;
      return `- ${l.project_type || 'Lead'}${contactName ? ` (${contactName})` : ''} — ${l.stage}${l.estimated_value ? `, $${l.estimated_value.toLocaleString()}` : ''}${isStale ? ' ⚠ FOLLOW-UP OVERDUE' : ''}`;
    });

    const result = `${leads.length} open leads, pipeline value $${pipelineValue.toLocaleString()}${staleLeads.length > 0 ? ` (${staleLeads.length} need follow-up)` : ''}:\n${lines.join('\n')}`;
    return truncateToTokenBudget(result);
  } catch { return ''; }
}

async function buildBrandSummary(directus: any, organizationId: string): Promise<string> {
  try {
    const org = await directus.request(
      readItem('organizations', organizationId, {
        fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
      }),
    ) as any;

    if (!org) return '';
    if (!org.brand_direction && !org.goals && !org.target_audience) return '';

    const parts: string[] = [`BRAND CONTEXT (Organization: ${org.name || 'Unknown'}):`];
    if (org.brand_direction) parts.push(`Brand Direction: ${org.brand_direction}`);
    if (org.goals) parts.push(`Goals: ${org.goals}`);
    if (org.target_audience) parts.push(`Target Audience: ${org.target_audience}`);
    if (org.location) parts.push(`Location: ${org.location}`);

    return truncateToTokenBudget(parts.join('\n'));
  } catch { return ''; }
}
