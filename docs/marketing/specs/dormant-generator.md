# `dormantClientsGenerator` — production spec

The first AI generator to wire end-to-end. Produces 1-3 touches (emails + optional one social) for re-engaging high-value clients who've gone quiet.

## Tool schema (Anthropic tool use)

```ts
const produceDormantOutreachTool = {
  name: 'produce_dormant_outreach',
  description:
    'Produce 1-3 touches (emails and optionally one social post) to re-engage dormant ' +
    'high-value clients. Lead with value, not gap.',
  input_schema: {
    type: 'object',
    properties: {
      touches: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['email', 'social'] },
            send_offset_hours: {
              type: 'integer',
              minimum: 0,
              maximum: 168,
              description: 'Hours from campaign start. 0 = launch immediately.',
            },
            email: {
              type: 'object',
              description: 'Required if kind=email.',
              properties: {
                subject: { type: 'string', maxLength: 60 },
                preview_text: { type: 'string', maxLength: 90 },
                body_markdown: {
                  type: 'string',
                  description:
                    '80-150 words. Markdown allowed (paragraphs, one optional list). ' +
                    'Use {{first_name}} for personalization. Never hardcode names from sample_names.',
                },
                cta: {
                  type: 'string',
                  enum: ['book_call', 'reply', 'view_portfolio', 'view_case_study', 'reply_with_question'],
                },
                audience_filter: {
                  type: 'string',
                  enum: ['all', 'opened_previous', 'unopened_previous'],
                },
              },
              required: ['subject', 'preview_text', 'body_markdown', 'cta', 'audience_filter'],
            },
            social: {
              type: 'object',
              description: 'Required if kind=social.',
              properties: {
                channel: { type: 'string', enum: ['linkedin', 'instagram', 'twitter'] },
                caption: {
                  type: 'string',
                  maxLength: 600,
                  description:
                    'LinkedIn: 100-300 words, first line is hook, no link in body, max 2 hashtags. ' +
                    'Instagram: 50-150 words. Twitter: under 280 chars.',
                },
                image_brief: {
                  type: 'string',
                  maxLength: 200,
                  description: 'Description of what the image should show. Not a generation prompt.',
                },
              },
              required: ['channel', 'caption', 'image_brief'],
            },
          },
          required: ['kind', 'send_offset_hours'],
        },
      },
      cadence_rationale: { type: 'string', maxLength: 240 },
      facts_used: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fact IDs from available_facts that were referenced in copy. Used for grounding validation.',
      },
    },
    required: ['touches', 'cadence_rationale', 'facts_used'],
  },
} as const;
```

## System prompt

```
You are drafting a re-engagement campaign for a small business reaching
out to high-value clients who haven't been in contact for some time.
Produce 1-2 emails (and optionally one social post) that bring these
clients back into conversation without sounding desperate, salesy,
or generic.

GROUNDING — non-negotiable:
- You may ONLY reference projects, services, wins, or testimonials
  that appear in available_facts. Never invent a past project or
  capability. If available_facts is sparse, write more abstractly
  rather than fabricating specifics.
- Every fact ID you reference in copy must appear in your facts_used
  output array.
- Use {{first_name}} for the recipient's name. Do not hardcode names
  from sample_names — those are illustrative only.

TONE:
- "Re-engagement" is not "we miss you." The latter is desperation.
- Lead with value or news, not the gap. ("Saw something that reminded
  me of what we built together" beats "It's been a while.")
- Match the voice fingerprint precisely. Formality > 60: formal
  address, complete sentences. Warmth > 70: first-person, contractions,
  direct questions allowed. Jargon level: don't exceed it.
- Use signature_phrases when natural. Never use avoid_phrases.

OPENERS TO AVOID:
- "We miss you" / "It's been a while" / "Long time no see"
- "Just checking in" / "Touching base" / "Circling back"
- "Hope you're doing well" as an opener (allowed mid-email)
- Any opener that announces the gap before saying anything else

OPENERS THAT WORK:
- Reference a recent specific event from available_facts
- Lead with a question grounded in their past project
- Mention something you noticed/built/learned that reminded you of them

EMAIL STRUCTURE:
- Subject: 30-60 chars, specific, intriguing, no clickbait, no
  all-caps, no urgency tricks ("Last chance"), no emoji unless voice
  fingerprint shows past emoji use.
- Body: 80-150 words. One clear CTA matching the cta field.
- Preview text: complements subject, doesn't repeat it.

SOCIAL STRUCTURE:
- LinkedIn: 100-300 words, hook first, no link in body (deprioritized).
- First sentence must work as a stand-alone hook in the feed.
- Image brief: describe what to show, not how to render it.

CADENCE GUIDANCE:
- Touch 1: send_offset_hours 0-24 (Tue/Wed morning preferred).
- Touch 2 (email follow-up): send_offset_hours 96-120, audience_filter
  unopened_previous if applicable.
- Social: send_offset_hours 24-72, complements but doesn't duplicate
  email content.

CALL produce_dormant_outreach EXACTLY ONCE. No prose response.
```

## User message template

```
ORG
===
{{org.name}} — {{org.industry}}

VOICE FINGERPRINT
=================
Formality: {{voice.formality}}/100
Warmth: {{voice.warmth}}/100
Jargon level: {{voice.jargon_level}}
Signature phrases: {{voice.signature_phrases | join(", ")}}
Avoid phrases: {{voice.avoid_phrases | join(", ")}}

Example paragraphs in this voice:
---
{{voice.example_paragraphs.0}}
---
{{voice.example_paragraphs.1}}
---
{{voice.example_paragraphs.2}}

CANDIDATE
=========
Audience: {{audience.size}} high-value clients (referenced as {{first_name}} in copy)
Average days since last contact: {{signal.avg_days_since_contact}}
Longest gap: {{signal.longest_gap_days}} days
Tier: {{signal.tier}}
Lifetime revenue (audience total): ${{signal.lifetime_revenue_usd}}

AVAILABLE FACTS (only these may be referenced in copy)
======================================================
{{available_facts_json}}

CONSTRAINTS
===========
Channels: {{constraints.channels | default("email + optionally one social")}}
Touch count: {{constraints.touch_count | default("2-3")}}

Produce the campaign.
```

## Available-facts shape

```ts
type AvailableFact = {
  id: string;                 // e.g. "proj_terra"
  kind: 'project' | 'service' | 'win' | 'testimonial';
  title: string;
  one_line_summary: string;
  detail?: string;            // optional 2-3 sentences
  date?: string;              // ISO when relevant
  client_name?: string;       // if kind=project
};
```

Built by a deterministic facts-builder (`buildAvailableFactsForDormant(orgId)`) that pulls:
- Recent completed projects (`projects.status='complete'`, last 6 months) — top 5 by recency
- Listed services from the org's services collection
- Recent wins from a wins collection or `proposals.signed_at` events — top 3
- Optional testimonials if a testimonials collection exists

## Voice fingerprint — neutral default for v1

The full voice fingerprint subsystem (ingestion + storage) is designed but not yet built. For the first generator wiring, use neutral defaults so the generator runs end-to-end against any org:

```ts
const NEUTRAL_VOICE = {
  formality: 50,
  warmth: 60,
  energy: 45,
  jargon_level: 'low',
  pronoun_default: 'we',
  signature_phrases: [],
  avoid_phrases: [
    'circle back', 'synergy', 'leverage', 'best-in-class',
    'passionate about', 'we\'re so excited',
  ],
  tone_descriptors: ['professional', 'warm-but-direct', 'specific'],
  example_paragraphs: [],
  voice_summary: 'Default voice — clear, warm-but-professional, low jargon.',
};
```

When voice fingerprint subsystem ships, swap this for a real `getResolvedVoice(orgId)` call.

## Implementation checklist

1. **Model:** `claude-sonnet-4-6`. Haiku underperforms on voice-matching and the no-desperation tone rule.
2. **Prompt caching:** structure the message so cacheable content comes first. Cache breakpoint after the system prompt + voice fingerprint section.
3. **Token budget:** ~1,400 input + ~700 output ≈ 2,100 billed.
4. **Post-hoc validation pass** (cheap, no AI):
   - Every ID in `facts_used` exists in `available_facts` — reject + retry once if not.
   - Body word counts within 80-150 for emails (warn, don't reject).
   - Subject under 60 chars (schema-enforced, double-check after).
   - Caption respects per-channel length norms.
   - No `{{` placeholders other than `{{first_name}}` — catches stray template artifacts.
   - Avoid-phrase scan: any voice.avoid_phrases substring → reject + retry once.
5. **Token enforcement:** Use the existing `ai-token-enforcement.ts` pattern to deduct from org balance.
6. **Output adapter:** transform tool-call output into `DraftedCampaign` shape (the same shape the stub composable returns) so the drawer doesn't change.

## Wiring path

```
POST /api/marketing/recommendations/[id]/generate
  ├─ requireOrgMembership
  ├─ load recommendation + verify status pending|drafted
  ├─ getOrgContext(orgId)              // existing context-broker
  ├─ buildAvailableFactsForDormant(orgId)  // NEW
  ├─ getResolvedVoice(orgId)           // returns NEUTRAL_VOICE for v1
  ├─ runDormantGenerator({ candidate, facts, voice, org })  // NEW
  ├─ validate output (post-hoc passes above)
  ├─ deduct tokens from org balance
  ├─ update recommendation: status='drafted'
  └─ return DraftedCampaign-shaped JSON
```

## Output → DraftedCampaign mapping

The tool returns:
```json
{ "touches": [...], "cadence_rationale": "...", "facts_used": ["proj_terra", ...] }
```

Adapt to client shape (defined in [app/composables/useMarketingDrafts.ts](../../../app/composables/useMarketingDrafts.ts)):
```ts
{
  touches: tool_output.touches.map(adaptTouch),
  phase_strategy: null,                // dormant has no phases
  cadence_rationale: tool_output.cadence_rationale,
  facts_used: tool_output.facts_used.map((id) => ({
    id, label: factsById[id]?.title ?? id, kind: factsById[id]?.kind ?? 'fact',
  })),
  tokens_spent: usage.input + usage.output,
  duration_ms: Date.now() - startTime,
  voice_signals: ['drafted from your default voice profile'],
  audience_summary: { size: candidate.audience.size, sample_names: candidate.audience.sample_names },
}
```

Where `adaptTouch` flattens `{ kind, email, social }` into the flat DraftedTouch shape.

## What this unlocks

Once this generator is wired, every other one (project-complete, lead-reengagement, etc.) follows the exact same pattern with a different prompt + tool schema + fact selector. The architecture is reusable; only the prompt changes.

## See also

- Eval harness design: previous conversation history
- Voice fingerprint design: previous conversation history
- Schema: [shared/marketing-persistence.ts](../../../shared/marketing-persistence.ts)
- Existing stub: [app/composables/useMarketingDrafts.ts](../../../app/composables/useMarketingDrafts.ts)
- Schedule wiring (already shipped): [server/api/marketing/recommendations/[id]/schedule.post.ts](../../../server/api/marketing/recommendations/%5Bid%5D/schedule.post.ts)
