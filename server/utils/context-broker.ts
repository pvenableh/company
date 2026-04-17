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
  ticketsSummary: string;
  brandSummary: string;
  contactsSummary: string;
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

  // Run all 7 scope builders in parallel
  const [clientsSummary, projectsSummary, invoicesSummary, dealsSummary, ticketsSummary, brandSummary, contactsSummary] = await Promise.all([
    buildClientsSummary(directus, orgFilter, now),
    buildProjectsSummary(directus, orgFilter, now),
    buildInvoicesSummary(directus, orgFilter, now),
    buildDealsSummary(directus, orgFilter, now),
    buildTicketsSummary(directus, orgFilter, now),
    buildBrandSummary(directus, organizationId),
    buildContactsSummary(directus, organizationId, now),
  ]);

  const allText = [clientsSummary, projectsSummary, invoicesSummary, dealsSummary, ticketsSummary, brandSummary, contactsSummary].join('');
  const tokenEstimate = Math.ceil(allText.length / 4);

  const context: CachedOrgContext = {
    clientsSummary,
    projectsSummary,
    invoicesSummary,
    dealsSummary,
    ticketsSummary,
    brandSummary,
    contactsSummary,
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
    ticketsSummary: data.ticketsSummary || '',
    brandSummary: data.brandSummary || '',
    contactsSummary: data.contactsSummary || '',
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
    ticketsSummary: context.ticketsSummary,
    brandSummary: context.brandSummary,
    contactsSummary: context.contactsSummary,
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

async function buildTicketsSummary(directus: any, orgFilter: any, now: Date): Promise<string> {
  try {
    const tickets = await directus.request(
      readItems('tickets', {
        filter: {
          ...orgFilter,
          status: { _in: ['open', 'in_progress', 'pending'] },
        },
        fields: ['id', 'title', 'status', 'priority', 'assigned_to.first_name', 'assigned_to.last_name', 'date_created', 'project.name'],
        sort: ['-priority', '-date_created'],
        limit: 15,
      }),
    ) as any[];

    if (tickets.length === 0) return '';

    const urgentCount = tickets.filter(t => t.priority === 'urgent').length;
    const highCount = tickets.filter(t => t.priority === 'high').length;
    const lines = tickets.slice(0, 10).map((t) => {
      const assignee = t.assigned_to ? `${t.assigned_to.first_name || ''} ${t.assigned_to.last_name || ''}`.trim() : 'Unassigned';
      const project = t.project?.name ? ` [${t.project.name}]` : '';
      return `- #${t.id}: ${t.title || 'Untitled'} — ${t.status}, ${t.priority}${project} (${assignee})`;
    });

    const result = `${tickets.length} open tickets${urgentCount ? ` (${urgentCount} urgent)` : ''}${highCount ? `, ${highCount} high priority` : ''}:\n${lines.join('\n')}`;
    return truncateToTokenBudget(result);
  } catch { return ''; }
}

async function buildContactsSummary(directus: any, organizationId: string, now: Date): Promise<string> {
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Contacts scoped to the org via the M2M junction
    const contacts = await directus.request(
      (readItems as any)('contacts', {
        filter: {
          organizations: { organizations_id: { _eq: organizationId } },
          status: { _neq: 'archived' },
        },
        fields: [
          'id', 'first_name', 'last_name', 'email', 'company', 'category',
          'email_subscribed', 'email_bounced',
          'total_emails_sent', 'total_opens', 'total_clicks',
          'last_opened_at', 'last_clicked_at',
          'lists.list_id.name', 'lists.subscribed',
        ],
        limit: 250,
      }),
    ) as any[];

    if (!contacts.length) return '';

    const subscribed = contacts.filter((c) => c.email_subscribed !== false);
    const bounced = contacts.filter((c) => c.email_bounced);
    const recentOpens = contacts
      .filter((c) => c.last_opened_at && c.last_opened_at > thirtyDaysAgo)
      .sort((a, b) => (b.last_opened_at || '').localeCompare(a.last_opened_at || ''));
    const topEngaged = [...contacts]
      .filter((c) => (c.total_opens || 0) + (c.total_clicks || 0) > 0)
      .sort((a, b) => ((b.total_opens || 0) + (b.total_clicks || 0)) - ((a.total_opens || 0) + (a.total_clicks || 0)))
      .slice(0, 8);

    // Open leads per contact (for the AI to answer "what's happening with X")
    const openLeads = await directus.request(
      (readItems as any)('leads', {
        filter: {
          organization: { _eq: organizationId },
          stage: { _nin: ['won', 'lost'] },
          status: { _eq: 'published' },
          related_contact: { _nnull: true },
        },
        fields: ['related_contact', 'stage'],
        limit: 200,
      }),
    ) as Array<{ related_contact: string | null; stage: string }>;

    const openLeadsByContact = new Map<string, number>();
    for (const l of openLeads) {
      const cid = typeof l.related_contact === 'string' ? l.related_contact : (l.related_contact as any)?.id;
      if (cid) openLeadsByContact.set(cid, (openLeadsByContact.get(cid) || 0) + 1);
    }

    const lines: string[] = [];
    lines.push(`${contacts.length} contacts (${subscribed.length} subscribed${bounced.length ? `, ${bounced.length} bounced` : ''}).`);

    if (topEngaged.length) {
      lines.push('Most engaged (by opens + clicks):');
      for (const c of topEngaged.slice(0, 6)) {
        const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Unnamed';
        const listNames = Array.isArray(c.lists)
          ? c.lists.map((m: any) => m?.list_id?.name).filter(Boolean).slice(0, 3).join(', ')
          : '';
        const activeLeadCount = openLeadsByContact.get(c.id) || 0;
        const bits: string[] = [];
        bits.push(`${c.total_opens || 0}o/${c.total_clicks || 0}c`);
        if (c.company) bits.push(c.company);
        if (activeLeadCount) bits.push(`${activeLeadCount} open lead${activeLeadCount === 1 ? '' : 's'}`);
        if (listNames) bits.push(`lists: ${listNames}`);
        if (c.email_bounced) bits.push('⚠ bounced');
        lines.push(`- ${name} — ${bits.join(' · ')}`);
      }
    }

    if (recentOpens.length && recentOpens.length !== topEngaged.length) {
      lines.push(`${recentOpens.length} contacts opened an email in the last 30 days.`);
    }

    if (bounced.length) {
      lines.push(`Bounced (do not email): ${bounced.slice(0, 5).map((c) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email).join(', ')}${bounced.length > 5 ? `, +${bounced.length - 5} more` : ''}.`);
    }

    return truncateToTokenBudget(lines.join('\n'));
  } catch {
    return '';
  }
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
