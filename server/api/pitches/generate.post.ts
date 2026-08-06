/**
 * Generate a bespoke, org-themed pitch page with Earnest AI (staff, org-scoped).
 *
 * The LLM emits COMPACT CONTENT JSON (personalized copy + section selection),
 * grounded strictly in the org's brand + what-we-sell + the target record + its
 * touchpoint history. A deterministic template (pitch-template.ts) renders it to
 * self-contained HTML, which is persisted via the shared publishPitch() pipeline
 * as a DRAFT pitch_pages row (HITL — the user reviews /p/<token> before sharing).
 *
 * Gated behind the `proposals` feature + AI token budget.
 */
import { readItem, readItems } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { getServerDirectus } from '~~/server/utils/directus';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits, deductOrgTokens } from '~~/server/utils/ai-token-enforcement';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { logAiAction } from '~~/server/utils/ai-actions';
import { getEntityContext } from '~~/server/utils/entity-context';
import { publishPitch } from '~~/server/utils/pitch-publish';
import { renderPitchHtml, resolvePitchSettings, type PitchContent, type PitchSettings } from '~~/server/utils/pitch-template';

/** Robust JSON parse (fence-strip + outermost-{} fallback). */
function parseJson<T = any>(raw: string): T | null {
  const t = (raw || '').trim();
  for (const c of [t, t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')]) {
    try { const p = JSON.parse(c); if (p && typeof p === 'object') return p as T; } catch { /* next */ }
  }
  const f = t.indexOf('{'), l = t.lastIndexOf('}');
  if (f >= 0 && l > f) { try { return JSON.parse(t.slice(f, l + 1)) as T; } catch { /* give up */ } }
  return null;
}

const SYSTEM = (orgName: string, targetName: string, today: string) => [
  `You are Earnest, composing a bespoke B2B pitch page for ${orgName} to send to ${targetName || 'a prospective client'}.`,
  `Today is ${today}.`,
  '',
  'ACCURACY (non-negotiable): Use ONLY facts present in the KNOWN CONTEXT below. Do NOT invent client names, metrics, prices, dates, case studies, credentials, or results. When a compelling detail is unknown, either omit it or use a clearly bracketed placeholder like "[add a recent result]". Never present a guess as fact. Write in a confident, warm, plain voice — never hype.',
  '',
  'Compose the pitch as STRICT JSON only (no markdown fences, no commentary) matching:',
  '{',
  '  "title": string,                         // internal label, e.g. "<Target> — Partnership"',
  '  "client_name": string | null,            // display name of the target',
  '  "sections": [',
  '    { "kind":"hero", "eyebrow":string|null, "headline":string, "subhead":string|null, "cta_label":string|null },',
  '    { "kind":"offerings", "heading":string, "items":[{ "title":string, "body":string }] },   // 3-6, from what-we-sell',
  '    { "kind":"proof", "heading":string, "items":[{ "title":string, "body":string }] },         // why us / differentiators',
  '    { "kind":"tailored", "heading":string, "body":string, "bullets":string[] },                // specific to THIS target + its history',
  '    { "kind":"process", "heading":string, "steps":[{ "title":string, "body":string }] },',
  '    { "kind":"faq", "heading":string, "qa":[{ "q":string, "a":string }] },',
  '    { "kind":"cta", "heading":string, "body":string, "button_label":string|null }',
  '  ],',
  '  "facts_used": string[]                    // which known facts you leveraged',
  '}',
  '',
  'Include a section ONLY when you have real substance for it. A strong pitch usually has hero + offerings + proof + tailored + cta; add process/faq when they help. The "tailored" section must reference this specific target using the known context (their brand, goals, location, and recent touchpoints) — this is what makes the pitch land.',
].join('\n');

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    organization?: string;
    link?: string | null;         // "<client|lead|contact>:<id>"
    brief?: string;
    title?: string;
    settings?: Partial<PitchSettings>;
    password?: string | null;
    expires_at?: string | null;
  }>(event);

  const organization = String(body?.organization || '');
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

  // 1. Auth + feature gate (HTTP boundary).
  const { userId } = await requireOrgPermission(event, organization, 'proposals', 'create');

  // 2. Decode link → { lead, client, contact } + entity for context.
  let lead: number | null = null, client: string | null = null, contact: string | null = null;
  let entityType: 'lead' | 'client' | 'contact' | null = null;
  let entityId = '';
  const m = /^(client|lead|contact):(.+)$/.exec(String(body?.link || '').trim());
  if (m) {
    entityType = m[1] as any; entityId = m[2];
    if (entityType === 'lead' && /^\d+$/.test(entityId)) lead = Number(entityId);
    else if (entityType === 'client') client = entityId;
    else if (entityType === 'contact') contact = entityId;
  }

  // 3. AI token gate.
  const gate = await enforceTokenLimits(event, organization);
  if (!gate.allowed) {
    throw createError({
      statusCode: gate.statusCode || 402,
      message: gate.reason || 'AI token limit reached',
      data: { sellSheet: true, reason: 'tokens_depleted' },
    });
  }

  const directus = getServerDirectus();

  // 4. Assemble context (best-effort; grounding never blocks generation).
  const [orgRow, offerings, blocks, targetCtx, targetRow, touchpoints] = await Promise.all([
    directus.request(readItems('organizations', {
      filter: { id: { _eq: organization } },
      fields: ['id', 'name', 'website', 'whitelabel', 'industry', 'location', 'brand_direction', 'goals', 'target_audience', 'document_theme', 'document_accent', 'document_theme_config'],
      limit: 1,
    })).then((r: any[]) => r?.[0] || null).catch(() => null),
    directus.request(readItems('service_templates', {
      filter: { organization: { _eq: organization }, status: { _eq: 'published' } },
      fields: ['name', 'category', 'description', 'default_total'], limit: 12,
    })).catch(() => []),
    directus.request(readItems('document_blocks', {
      filter: { organization: { _eq: organization }, status: { _eq: 'published' } },
      fields: ['name', 'category', 'description'], limit: 12,
    })).catch(() => []),
    entityType ? getEntityContext(entityType, String(entityId), organization, userId).catch(() => '') : Promise.resolve(''),
    entityType ? readTarget(directus, entityType, entityId).catch(() => null) : Promise.resolve(null),
    (client || lead) ? directus.request(readItems('touchpoints', {
      filter: { organization: { _eq: organization }, ...(client ? { client: { _eq: client } } : { lead: { _eq: lead } }) },
      fields: ['type', 'summary', 'note', 'outcome', 'occurred_at'], sort: ['-occurred_at'], limit: 10,
    })).catch(() => []) : Promise.resolve([]),
  ]);

  const targetName = targetRow?.displayName || body?.title || '';

  // 5. Build KNOWN CONTEXT.
  const lines: string[] = [];
  if (orgRow) {
    lines.push('=== YOUR ORGANISATION (the sender) ===');
    for (const [k, label] of [['name', 'Name'], ['industry', 'Industry'], ['location', 'Location'], ['website', 'Website'], ['brand_direction', 'Brand / voice'], ['goals', 'Goals'], ['target_audience', 'Target audience']] as const) {
      if (orgRow[k]) lines.push(`${label}: ${orgRow[k]}`);
    }
  }
  if ((offerings as any[])?.length) {
    lines.push('\n=== WHAT YOU SELL (service offerings) ===');
    for (const s of offerings as any[]) lines.push(`- ${s.name}${s.category ? ` (${s.category})` : ''}${s.description ? `: ${s.description}` : ''}${s.default_total ? ` — from $${Math.round(s.default_total).toLocaleString()}` : ''}`);
  }
  if ((blocks as any[])?.length) {
    lines.push('\n=== REUSABLE CONTENT AVAILABLE (document library) ===');
    for (const b of blocks as any[]) lines.push(`- ${b.name}${b.category ? ` (${b.category})` : ''}${b.description ? `: ${b.description}` : ''}`);
  }
  if (targetCtx) lines.push('\n=== THE TARGET (who you are pitching) ===\n' + targetCtx);
  if (targetRow?.brandLines?.length) lines.push('\nTarget brand details:\n' + targetRow.brandLines.join('\n'));
  if ((touchpoints as any[])?.length) {
    lines.push('\n=== RECENT TOUCHPOINTS (history with this target) ===');
    for (const t of touchpoints as any[]) lines.push(`- [${(t.occurred_at || '').slice(0, 10)}] ${t.type}${t.outcome ? ` (${t.outcome})` : ''}: ${t.summary || t.note || ''}`.slice(0, 220));
  }
  if (body?.brief?.trim()) lines.push('\n=== BRIEF FROM THE USER (what to emphasise) ===\n' + body.brief.trim());

  const known = lines.length ? lines.join('\n') : '(No structured context available — keep the pitch general and honest; do not invent specifics.)';
  const today = new Date().toISOString().slice(0, 10);

  // 6. Generate.
  const provider = getLLMProvider();
  const response = await provider.chat(
    [{ role: 'user', content: `KNOWN CONTEXT:\n${known}\n\nCompose the pitch page JSON for ${targetName || 'this prospect'}.` }],
    { systemPrompt: SYSTEM(orgRow?.name || 'the organisation', targetName, today), maxTokens: 8000 },
  );

  const content = parseJson<PitchContent>(response.content);
  if (!content || !Array.isArray(content.sections) || !content.sections.length) {
    throw createError({ statusCode: 502, message: 'Earnest returned an unusable pitch. Please try again.' });
  }

  // 7. Render via the org-themed template.
  const settings = resolvePitchSettings(body?.settings, orgRow || {});
  const html = renderPitchHtml({
    content,
    settings,
    org: { name: orgRow?.name || 'Our team', website: orgRow?.website, whitelabel: !!orgRow?.whitelabel },
    theme: orgRow || {},
  });

  const title = (body?.title || content.title || `Pitch — ${targetName || 'prospect'}`).slice(0, 120);

  // 8. Publish as DRAFT (reviewed before sharing).
  const result = await publishPitch({
    organization, userId, title, html,
    links: { lead, client, contact },
    client_name: content.client_name || targetName || null,
    password: body?.password || null,
    expires_at: body?.expires_at || null,
    publish: false,
  });

  // 9. Meter + audit (non-blocking).
  if (response.usage) {
    const { inputTokens = 0, outputTokens = 0 } = response.usage;
    logAIUsage({ event, endpoint: 'pitches/generate', model: response.model, inputTokens, outputTokens, organizationId: organization, metadata: { pitchId: result.id, link: body?.link } }).catch(() => {});
    deductOrgTokens(organization, inputTokens + outputTokens).catch(() => {});
  }
  logAiAction({
    organizationId: organization, userId, actionType: 'generate_pitch', status: 'executed',
    title: `Drafted pitch: ${title}`, entityType: 'pitch_pages', entityId: String(result.id),
    payload: { link: body?.link, brief: body?.brief, settings }, result: { token: result.token },
  }).catch(() => {});

  return { id: result.id, token: result.token, url: result.url, status: 'draft', title };
});

/** Read a target record → display name + brand context lines (by type). */
async function readTarget(directus: any, type: 'lead' | 'client' | 'contact', id: string): Promise<{ displayName: string; brandLines: string[] } | null> {
  const brandLines: string[] = [];
  if (type === 'client') {
    const c = await directus.request(readItem('clients', id, { fields: ['name', 'industry', 'location', 'website', 'notes', 'brand_direction', 'goals', 'target_audience', 'services'] })) as any;
    if (!c) return null;
    for (const [k, label] of [['industry', 'Industry'], ['location', 'Location'], ['website', 'Website'], ['brand_direction', 'Their brand'], ['goals', 'Their goals'], ['target_audience', 'Their audience'], ['notes', 'Notes']] as const) if (c[k]) brandLines.push(`${label}: ${c[k]}`);
    if (Array.isArray(c.services) && c.services.length) brandLines.push(`Services we provide them: ${c.services.join(', ')}`);
    return { displayName: c.name || 'Client', brandLines };
  }
  if (type === 'contact') {
    const c = await directus.request(readItem('contacts', id, { fields: ['first_name', 'last_name', 'company', 'title', 'website', 'industry', 'notes'] })) as any;
    if (!c) return null;
    for (const [k, label] of [['company', 'Company'], ['title', 'Title'], ['industry', 'Industry'], ['website', 'Website'], ['notes', 'Notes']] as const) if (c[k]) brandLines.push(`${label}: ${c[k]}`);
    return { displayName: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company || 'Contact', brandLines };
  }
  // lead
  const l = await directus.request(readItem('leads', id, { fields: ['project_type', 'timeline', 'estimated_value', 'notes', 'related_contact.first_name', 'related_contact.last_name', 'related_contact.company'] })) as any;
  if (!l) return null;
  for (const [k, label] of [['project_type', 'Project type'], ['timeline', 'Timeline'], ['notes', 'Notes']] as const) if (l[k]) brandLines.push(`${label}: ${l[k]}`);
  if (l.estimated_value) brandLines.push(`Estimated value: $${Math.round(l.estimated_value).toLocaleString()}`);
  const rc = l.related_contact;
  const name = rc ? `${rc.first_name || ''} ${rc.last_name || ''}`.trim() || rc.company : '';
  return { displayName: name || `Lead #${id}`, brandLines };
}
