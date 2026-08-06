/**
 * Generate a Claude Code build brief for a bespoke prototype (staff, org-scoped).
 *
 * The bespoke prototype (like the Myles pitch) is specific code work — Earnest
 * doesn't build it, it writes the BRIEF: a copy-ready Claude Code prompt (idea +
 * brand + target + spec) grounded in the org's context. Attachable to a pitch OR
 * a proposal, and persisted to `prototype_briefs` for historical reference.
 *
 * Gated behind the `proposals` feature + AI token budget.
 */
import { createItem, readItem, readItems } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { getServerDirectus } from '~~/server/utils/directus';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits, deductOrgTokens } from '~~/server/utils/ai-token-enforcement';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { logAiAction } from '~~/server/utils/ai-actions';
import { getEntityContext } from '~~/server/utils/entity-context';

const SYSTEM = (orgName: string, today: string) => [
  `You are Earnest, writing a BUILD BRIEF that ${orgName}'s developer will paste into Claude Code to build a bespoke prototype (a self-contained interactive web artifact — pitch page, microsite, demo).`,
  `Today is ${today}.`,
  '',
  'ACCURACY: Use only facts in the KNOWN CONTEXT. Do NOT invent brand details, metrics, or client facts. Where a build decision is open, state it as a clearly bracketed instruction like "[decide: 2 or 3 sections]". Be concrete and actionable — this is an instruction to an AI coding agent, not marketing copy.',
  '',
  'Return the brief as clean MARKDOWN (no code fences around the whole thing) with these sections:',
  '# <Prototype title>',
  '## Objective — what this prototype must accomplish and for whom.',
  '## Audience & context — who views it (the target) and the situation.',
  '## Deliverable — format (e.g. single self-contained responsive HTML page), constraints (self-contained, no external CDN, works on mobile).',
  '## Information architecture — the ordered sections/screens with a one-line purpose each.',
  '## Brand & design language — voice, palette, typography, motion feel, derived from the org brand context. Give specifics the coding agent can implement.',
  '## Content & data — what real content to use vs. bracketed placeholders; any data sources.',
  '## Interactions & motion — scroll behavior, animation, any interactive elements.',
  '## Acceptance criteria — a checklist of what "done" looks like.',
  '## Suggested approach — stack/libraries and any gotchas (e.g. inline CSS, self-host fonts, prefers-reduced-motion).',
  '## Out of scope — what NOT to build.',
  '',
  'Keep it tight and buildable. Prefer bullet points. The developer should be able to paste this straight into Claude Code and get a strong first build.',
].join('\n');

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    organization?: string;
    source?: 'pitch' | 'proposal' | 'manual';
    link?: string | null;            // "<client|lead|contact>:<id>"
    pitch?: number | null;
    proposal?: string | null;
    idea?: string;                   // what to prototype
    title?: string;
  }>(event);

  const organization = String(body?.organization || '');
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

  const { userId } = await requireOrgPermission(event, organization, 'proposals', 'create');

  const source = body?.source === 'pitch' || body?.source === 'proposal' ? body.source : 'manual';

  // Decode link.
  let lead: number | null = null, client: string | null = null, contact: string | null = null;
  let entityType: 'lead' | 'client' | 'contact' | null = null; let entityId = '';
  const m = /^(client|lead|contact):(.+)$/.exec(String(body?.link || '').trim());
  if (m) {
    entityType = m[1] as any; entityId = m[2];
    if (entityType === 'lead' && /^\d+$/.test(entityId)) lead = Number(entityId);
    else if (entityType === 'client') client = entityId;
    else if (entityType === 'contact') contact = entityId;
  }

  const gate = await enforceTokenLimits(event, organization);
  if (!gate.allowed) throw createError({ statusCode: gate.statusCode || 402, message: gate.reason || 'AI token limit reached', data: { sellSheet: true, reason: 'tokens_depleted' } });

  const directus = getServerDirectus();

  // Context: org brand, target, and the source artifact (pitch / proposal).
  const [orgRow, targetCtx, pitchRow, proposalRow] = await Promise.all([
    directus.request(readItems('organizations', {
      filter: { id: { _eq: organization } },
      fields: ['id', 'name', 'website', 'industry', 'location', 'brand_direction', 'goals', 'target_audience'], limit: 1,
    })).then((r: any[]) => r?.[0] || null).catch(() => null),
    entityType ? getEntityContext(entityType, String(entityId), organization, userId).catch(() => '') : Promise.resolve(''),
    body?.pitch ? directus.request(readItem('pitch_pages', body.pitch as any, { fields: ['id', 'title', 'client_name'] })).catch(() => null) : Promise.resolve(null),
    body?.proposal ? directus.request(readItem('proposals', body.proposal as any, { fields: ['id', 'title', 'total_value'] })).catch(() => null) : Promise.resolve(null),
  ]);

  const lines: string[] = [];
  if (orgRow) {
    lines.push('=== YOUR ORGANISATION (building the prototype) ===');
    for (const [k, label] of [['name', 'Name'], ['industry', 'Industry'], ['location', 'Location'], ['website', 'Website'], ['brand_direction', 'Brand / voice'], ['goals', 'Goals'], ['target_audience', 'Audience']] as const) if (orgRow[k]) lines.push(`${label}: ${orgRow[k]}`);
  }
  if (targetCtx) lines.push('\n=== THE TARGET (who the prototype is for) ===\n' + targetCtx);
  if ((pitchRow as any)?.title) lines.push(`\n=== SOURCE PITCH ===\n"${(pitchRow as any).title}"${(pitchRow as any).client_name ? ` for ${(pitchRow as any).client_name}` : ''}`);
  if ((proposalRow as any)?.title) lines.push(`\n=== SOURCE PROPOSAL ===\n"${(proposalRow as any).title}"${(proposalRow as any).total_value ? ` ($${Math.round((proposalRow as any).total_value).toLocaleString()})` : ''}`);
  if (body?.idea?.trim()) lines.push('\n=== THE IDEA TO PROTOTYPE ===\n' + body.idea.trim());

  const known = lines.length ? lines.join('\n') : '(No structured context — keep the brief general and mark unknowns as bracketed decisions.)';
  const today = new Date().toISOString().slice(0, 10);

  const provider = getLLMProvider();
  const response = await provider.chat(
    [{ role: 'user', content: `KNOWN CONTEXT:\n${known}\n\nWrite the Claude Code build brief${body?.idea ? '' : ' for a prototype that advances this pitch/proposal'}.` }],
    { systemPrompt: SYSTEM(orgRow?.name || 'the organisation', today), maxTokens: 4000 },
  );

  const briefMd = (response.content || '').trim();
  if (!briefMd) throw createError({ statusCode: 502, message: 'Earnest returned an empty brief. Please try again.' });

  // Version = next for the same source artifact (best-effort).
  let version = 1;
  try {
    const existing = (await directus.request(readItems('prototype_briefs' as any, {
      filter: { organization: { _eq: organization }, ...(body?.pitch ? { pitch: { _eq: body.pitch } } : body?.proposal ? { proposal: { _eq: body.proposal } } : { source: { _eq: 'manual' } }) },
      fields: ['id'], limit: 1, meta: 'total_count' as any,
    } as any))) as any[];
    version = (Array.isArray(existing) ? existing.length : 0) + 1;
  } catch { /* collection may be provisioning */ }

  const title = (body?.title || (briefMd.match(/^#\s+(.+)$/m)?.[1]) || 'Prototype brief').slice(0, 140);

  // Persist (best-effort — the generated brief is still returned if this fails).
  let id: string | number | null = null;
  try {
    const created = (await directus.request(createItem('prototype_briefs' as any, {
      organization, source, title, brief_markdown: briefMd, status: 'draft', version,
      lead, client, contact, pitch: body?.pitch ?? null, proposal: body?.proposal ?? null,
      inputs_json: { link: body?.link, idea: body?.idea, pitch: body?.pitch, proposal: body?.proposal },
      user_created: userId,
    } as any))) as any;
    id = created?.id ?? null;
  } catch (err: any) {
    console.warn('[prototype-briefs] persist failed (collection provisioning?):', err?.message);
  }

  if (response.usage) {
    const { inputTokens = 0, outputTokens = 0 } = response.usage;
    logAIUsage({ event, endpoint: 'ai/generate-prototype-brief', model: response.model, inputTokens, outputTokens, organizationId: organization, metadata: { briefId: id, source } }).catch(() => {});
    deductOrgTokens(organization, inputTokens + outputTokens).catch(() => {});
  }
  logAiAction({ organizationId: organization, userId, actionType: 'generate_prototype_brief', status: 'executed', title: `Build brief: ${title}`, entityType: 'prototype_briefs', entityId: id != null ? String(id) : null, payload: { source, link: body?.link, pitch: body?.pitch, proposal: body?.proposal } }).catch(() => {});

  return { id, title, source, version, brief_markdown: briefMd, status: 'draft' };
});
