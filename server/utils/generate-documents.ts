// server/utils/generate-documents.ts
/**
 * Earnest AI document generator.
 *
 * Turns a plain-language overview of project deliverables into typed document
 * blocks for a proposal AND a matching contract, grounded in whatever real
 * context is available (lead/client/contact + org brand). The caller creates
 * DRAFT rows from the result — nothing is finalised or sent here.
 *
 * We emit ONLY the two block types that have working editors/renderers today
 * (`rich_text`, `scope_tree`); everything else in the registry is a placeholder,
 * so generating it would render blank. The LLM returns a compact shape which we
 * transform into the canonical DocumentBlockEntry format (assigning ids etc.).
 *
 * Honesty (per the Earnest voice charter): the prompt forbids inventing client
 * names, prices, dates, or terms that aren't given — unknowns are left null or
 * flagged as a bracketed placeholder for the user to fill in.
 */

import { readItem, createItem } from '@directus/sdk';
import type { LLMProvider } from './llm/types';
import { logAiAction } from './ai-actions';
import { newEntryId } from '~~/shared/blocks/normalize';
import type { DocumentBlockEntry, ScopeTreeNode } from '~~/shared/blocks/types';

// ── Compact shape the LLM emits (transformed into DocumentBlockEntry below) ──
interface LlmRichText { kind: 'rich_text'; heading?: string | null; body_markdown: string }
interface LlmScopePhase {
  heading: string;
  summary?: string | null;
  bullets?: string[];
  deliverables?: string[];
  hours?: number | null;
  fee?: number | null;
}
interface LlmScopeTree {
  kind: 'scope_tree';
  numbering_style?: 'phase_word' | 'phase_number' | 'decimal' | 'none';
  phases: LlmScopePhase[];
}
type LlmBlock = LlmRichText | LlmScopeTree;

interface LlmDocumentsResult {
  title: string;
  total_value: number | null;
  valid_until: string | null;
  proposal_blocks: LlmBlock[];
  contract_blocks: LlmBlock[];
}

export interface GenerateDocumentsInput {
  overview: string;
  organizationId: string;
  leadId?: number | string | null;
  clientId?: string | null;
  contactId?: string | null;
  targets?: Array<'proposal' | 'contract'>;
  provider: LLMProvider;
  model?: string;
}

export interface GeneratedDocuments {
  title: string;
  total_value: number | null;
  valid_until: string | null;
  proposalBlocks: DocumentBlockEntry[];
  contractBlocks: DocumentBlockEntry[];
  usage?: { inputTokens: number; outputTokens: number };
}

/** Transform one compact LLM block into a canonical DocumentBlockEntry, or null to drop it. */
function toEntry(b: LlmBlock): DocumentBlockEntry | null {
  if (!b || typeof b !== 'object') return null;
  if (b.kind === 'rich_text') {
    const body = (b.body_markdown || '').trim();
    if (!body && !b.heading) return null;
    return {
      id: newEntryId(),
      type: 'rich_text',
      payload: { heading: b.heading || null, body_markdown: body },
      library_ref: null,
      page_break_after: false,
    };
  }
  if (b.kind === 'scope_tree') {
    const phases: ScopeTreeNode[] = (Array.isArray(b.phases) ? b.phases : [])
      .filter((p) => p && p.heading)
      .map((p) => ({
        id: newEntryId(),
        heading: p.heading,
        summary: p.summary || null,
        bullets: Array.isArray(p.bullets) ? p.bullets.filter(Boolean) : [],
        deliverables: Array.isArray(p.deliverables) ? p.deliverables.filter(Boolean) : [],
        hours: typeof p.hours === 'number' ? p.hours : null,
        fee: typeof p.fee === 'number' ? p.fee : null,
        show_hours: typeof p.hours === 'number',
        show_fee: typeof p.fee === 'number',
        show_deliverables: Array.isArray(p.deliverables) && p.deliverables.length > 0,
        children: [],
      }));
    if (!phases.length) return null;
    return {
      id: newEntryId(),
      type: 'scope_tree',
      payload: { numbering_style: b.numbering_style || 'phase_word', phases },
      library_ref: null,
      page_break_after: false,
    };
  }
  return null;
}

function transformBlocks(blocks: LlmBlock[] | undefined): DocumentBlockEntry[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map(toEntry).filter((e): e is DocumentBlockEntry => e !== null);
}

/** Best-effort grounding context — names + brand. Never throws. */
async function gatherContext(input: GenerateDocumentsInput): Promise<string> {
  const directus = getTypedDirectus();
  const lines: string[] = [];

  try {
    const org = await directus.request(
      readItem('organizations', input.organizationId, {
        fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
      }),
    ) as any;
    if (org?.name) lines.push(`Vendor (the org sending this): ${org.name}`);
    if (org?.brand_direction) lines.push(`Brand direction: ${org.brand_direction}`);
    if (org?.target_audience) lines.push(`Target audience: ${org.target_audience}`);
    if (org?.location) lines.push(`Location: ${org.location}`);
  } catch { /* ignore */ }

  if (input.leadId != null) {
    try {
      const lead = await directus.request(
        readItem('leads', input.leadId as any, {
          fields: ['project_type', 'estimated_value', 'timeline', 'related_contact.first_name', 'related_contact.last_name', 'related_contact.company'],
        }),
      ) as any;
      if (lead?.related_contact) {
        const c = lead.related_contact;
        const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
        if (name) lines.push(`Client contact: ${name}${c.company ? ` (${c.company})` : ''}`);
      }
      if (lead?.project_type) lines.push(`Project type: ${lead.project_type}`);
      if (lead?.estimated_value) lines.push(`Estimated value on record: $${Number(lead.estimated_value).toLocaleString()}`);
      if (lead?.timeline) lines.push(`Timeline on record: ${lead.timeline}`);
    } catch { /* ignore */ }
  }

  if (input.contactId) {
    try {
      const c = await directus.request(
        readItem('contacts', input.contactId, { fields: ['first_name', 'last_name', 'company'] }),
      ) as any;
      const name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim();
      if (name) lines.push(`Client contact: ${name}${c?.company ? ` (${c.company})` : ''}`);
    } catch { /* ignore */ }
  }

  return lines.length ? `KNOWN CONTEXT (use only these facts; do not invent others):\n${lines.join('\n')}` : '';
}

function buildSystemPrompt(): string {
  return [
    'You are Earnest, generating professional business documents for a creative agency / small business.',
    'Given a plain-language overview of project deliverables plus any known context, produce a DRAFT proposal and a matching DRAFT contract.',
    '',
    'ACCURACY (non-negotiable): Use only facts present in the overview or the known context. Do NOT invent client names, company names, prices, dates, or contract terms that were not provided. When a needed detail is unknown, either leave the field null or write a clearly bracketed placeholder like "[Client to confirm start date]". Never present a guess as a fact.',
    '',
    'BLOCK TYPES — you may ONLY use these two:',
    '1. rich_text — { "kind": "rich_text", "heading": string|null, "body_markdown": string }. Use for prose sections (overview, approach, terms, clauses). Markdown allowed.',
    '2. scope_tree — { "kind": "scope_tree", "numbering_style": "phase_word", "phases": [ { "heading": string, "summary"?: string, "bullets"?: string[], "deliverables"?: string[], "hours"?: number|null, "fee"?: number|null } ] }. Use for phased scope / deliverables.',
    '',
    'PROPOSAL blocks should typically cover: a short overview/approach (rich_text), the scope & deliverables (scope_tree derived from the overview), timeline (rich_text), and investment/pricing (rich_text — only include figures given or clearly-bracketed placeholders).',
    'CONTRACT blocks should typically cover, as rich_text: parties & effective date, scope reference, payment terms, timeline/milestones, intellectual-property & ownership, confidentiality, termination, and a closing signature note. Keep terms standard and reasonable; bracket anything that requires the sender to decide (e.g. "[Payment: 50% deposit, 50% on delivery — confirm]").',
    '',
    'Return STRICT JSON only — no markdown fences, no commentary — matching:',
    '{',
    '  "title": string,                       // e.g. "Brand Identity — <Client>"',
    '  "total_value": number | null,          // only if a figure is given/derivable, else null',
    '  "valid_until": "YYYY-MM-DD" | null,',
    '  "proposal_blocks": Block[],',
    '  "contract_blocks": Block[]',
    '}',
  ].join('\n');
}

function parseJson(raw: string): LlmDocumentsResult | null {
  const trimmed = (raw || '').trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, ''),
  ];
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object') return parsed as LlmDocumentsResult;
    } catch { /* try next */ }
  }
  // Last resort: grab the outermost {...}
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)) as LlmDocumentsResult; } catch { /* give up */ }
  }
  return null;
}

/**
 * Generate draft proposal + contract blocks from an overview. Pure generation —
 * does not write to the database.
 */
export async function generateDocuments(input: GenerateDocumentsInput): Promise<GeneratedDocuments> {
  const context = await gatherContext(input);
  const targets = input.targets && input.targets.length ? input.targets : ['proposal', 'contract'];

  const userMessage = [
    `Project deliverables overview:\n${input.overview.trim()}`,
    context,
    `Generate: ${targets.join(' and ')}.`,
    targets.includes('proposal') ? '' : 'Return an empty array for proposal_blocks.',
    targets.includes('contract') ? '' : 'Return an empty array for contract_blocks.',
  ].filter(Boolean).join('\n\n');

  const result = await (input.provider as any).chat(
    [{ role: 'user', content: userMessage }],
    { systemPrompt: buildSystemPrompt(), model: input.model, maxTokens: 4096, temperature: 0.5 },
  );

  const text: string = typeof result === 'string' ? result : (result?.text || result?.content || '');
  const usage = typeof result === 'object' && result?.usage ? result.usage : undefined;

  const parsed = parseJson(text);
  if (!parsed) {
    throw createError({ statusCode: 502, message: 'AI returned an unparseable document draft. Please try again.' });
  }

  // valid_until default: 30 days out if the model left it null
  let validUntil = parsed.valid_until || null;
  if (!validUntil) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    validUntil = d.toISOString().slice(0, 10);
  }

  return {
    title: (parsed.title || 'Untitled Proposal').trim(),
    total_value: typeof parsed.total_value === 'number' ? parsed.total_value : null,
    valid_until: validUntil,
    proposalBlocks: targets.includes('proposal') ? transformBlocks(parsed.proposal_blocks) : [],
    contractBlocks: targets.includes('contract') ? transformBlocks(parsed.contract_blocks) : [],
    usage,
  };
}

export interface PersistDraftInput {
  organizationId: string;
  userId?: string | null;
  leadId?: number | string | null;
  clientId?: string | null;
  contactId?: string | null;
  targets: Array<'proposal' | 'contract'>;
  overview: string;
}

export interface PersistedDocuments {
  proposalId: string | null;
  contractId: string | number | null;
}

/**
 * Create DRAFT proposal + contract rows from an already-generated result and
 * record the generation in the ai_actions audit log. Uses the admin client
 * (create perms are FK-walked, which Directus 11 doesn't enforce on create);
 * callers MUST have verified org membership first. Draft-creation is
 * non-outbound, so the audit entry is logged as 'executed'.
 */
export async function persistDraftDocuments(
  gen: GeneratedDocuments,
  input: PersistDraftInput,
): Promise<PersistedDocuments> {
  const directus = getTypedDirectus();
  let proposalId: string | null = null;
  let contractId: string | number | null = null;

  if (input.targets.includes('proposal') && gen.proposalBlocks.length) {
    const created = await directus.request(
      createItem('proposals', {
        title: gen.title,
        organization: input.organizationId,
        proposal_status: 'draft',
        blocks: gen.proposalBlocks,
        total_value: gen.total_value,
        valid_until: gen.valid_until,
        lead: input.leadId ?? null,
        contact: input.contactId ?? null,
      } as any),
    ) as any;
    proposalId = created?.id ?? null;
  }

  if (input.targets.includes('contract') && gen.contractBlocks.length) {
    const created = await directus.request(
      createItem('contracts', {
        title: gen.title,
        organization: input.organizationId,
        contract_status: 'draft',
        blocks: gen.contractBlocks,
        total_value: gen.total_value,
        valid_until: gen.valid_until,
        contact: input.contactId ?? null,
        lead: input.leadId ?? null,
        client: input.clientId ?? null,
        proposal: proposalId ?? null,
        signing_token: crypto.randomUUID(),
      } as any),
    ) as any;
    contractId = created?.id ?? null;
  }

  await logAiAction({
    organizationId: input.organizationId,
    userId: input.userId,
    actionType: 'generate_documents',
    status: 'executed',
    title: `Drafted ${[proposalId && 'proposal', contractId && 'contract'].filter(Boolean).join(' + ') || 'documents'}: ${gen.title}`,
    payload: { overview: input.overview, targets: input.targets, leadId: input.leadId, clientId: input.clientId, contactId: input.contactId },
    result: { proposalId, contractId, total_value: gen.total_value },
    entityType: input.leadId != null ? 'leads' : null,
    entityId: input.leadId != null ? String(input.leadId) : null,
  });

  return { proposalId, contractId };
}
