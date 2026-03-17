# Build the AI Marketing Strategy Engine — Phase 1

## What You're Building

A marketing intelligence dashboard at `/marketing` that aggregates data from across all Earnest modules and uses AI to generate actionable marketing insights. This is the feature that makes Earnest's "one platform" promise real — no isolated tool can see what this sees.

## Context

Earnest is a Nuxt 3 + Vue 3 + Directus multi-tenant SaaS platform. It already has:
- **AI Email Wizard** (`components/Newsletter/AIEmailWizard.vue` + `server/api/newsletters/ai-generate.post.ts`)
- **AI Social Wizard** (`components/Social/AISocialWizard.vue` + `server/api/social/ai-generate.post.ts`)
- **AI Command Center** (existing at `/command-center` — analyzes modules for action items)
- **LLM Provider** (`server/utils/llm/factory.ts` → `getLLMProvider()` → Claude/Anthropic)
- **183 Directus collections** defined in `types/directus.ts`

The concept doc with full feature spec is at `.claude/prompts/ai-marketing-strategy-engine.md`. Read it first.

## Phase 1 Scope — Marketing Dashboard + Quick Insights + Campaign Planner

### 1. Data Aggregation Utility — `server/utils/marketing-intelligence.ts`

Create a utility that gathers marketing-relevant data across modules:

```typescript
export async function getMarketingContext(directus: DirectusClient, orgId: string) {
  // Fetch in parallel from these collections:
  // - contacts: total count, by status, recent growth (last 30 days), top tags
  // - social_posts: recent posts by platform, engagement metrics, posting frequency
  // - social_accounts: connected platforms, follower counts
  // - social_analytics_snapshots: engagement trends over time
  // - emails/email_templates: campaign count, recent campaigns
  // - mailing_lists + mailing_list_contacts: list sizes, subscriber counts
  // - clients: by status (active/prospect/churned), by industry
  // - invoices: monthly revenue trend (last 6 months), top services
  // - projects: active count, upcoming milestones
  // - tickets: recent volume, common categories
  //
  // Return a structured summary object (not raw data — summarize for LLM context)
}
```

Use `getUserDirectus(event)` for authenticated Directus access. Filter everything by the user's org. Keep the returned context under ~4000 tokens when serialized — summarize, don't dump raw records.

### 2. AI Analysis Endpoint — `server/api/marketing/ai-analyze.post.ts`

Follow the established pattern from `server/api/social/ai-generate.post.ts`:

```typescript
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  // Validate body: { analysisType: 'dashboard' | 'campaign', goal?: string, timeframe?: string }
  const directus = await getUserDirectus(event);
  const context = await getMarketingContext(directus, orgId);
  const provider = getLLMProvider();
  // Build system prompt with the aggregated context
  // For 'dashboard': generate health score, insights, recommendations
  // For 'campaign': generate multi-channel campaign plan from the goal
  // Return structured JSON
});
```

**Dashboard analysis should return:**
```typescript
{
  healthScore: number, // 0-100
  healthBreakdown: { contentConsistency, audienceGrowth, engagement, emailPerformance },
  insights: [{ type, title, description, priority, actionable }],
  contentVelocity: { postsPerWeek, emailsPerMonth, trend },
  audienceGrowth: { followers, subscribers, contacts, trend },
  recommendations: [{ title, description, channel, effort, impact }]
}
```

**Campaign analysis should return:**
```typescript
{
  campaignName: string,
  objective: string,
  timeline: [{ week, activities: [{ channel, action, details }] }],
  emailSequence: [{ day, subject, keyMessage, cta, segment }],
  socialPosts: [{ platform, content, hashtags, timing }],
  kpis: [{ metric, target, rationale }]
}
```

### 3. Marketing Dashboard Page — `pages/marketing.vue`

Create the page with these sections:

**Header area:**
- Page title "Marketing Intelligence"
- "Analyze" button (triggers AI analysis with loading state)
- Last analyzed timestamp

**Health Score card:**
- Large circular score (0-100) with color coding
- Breakdown bars for sub-metrics
- Trend indicator

**Quick Insights grid:**
- Card-based layout for AI-generated insights
- Each card has: icon, title, description, priority badge, action button
- Action buttons can link to relevant pages or open Email/Social wizards

**Content Velocity:**
- Simple stats: posts/week, emails/month, with trend arrows

**Audience Overview:**
- Combined followers + subscribers + contacts count with growth trend

**Campaign Planner section:**
- Text input: "What's your marketing goal?"
- Generate button
- Results display as a timeline with expandable week cards
- Each activity card has a "Create" button that opens the relevant AI wizard (email or social) pre-filled

### 4. Component Architecture

Follow existing patterns:
- Use `shadcn-vue` components (the project uses these extensively)
- Use Tailwind CSS v4 for styling
- Use `UIcon` from Nuxt UI for icons (Lucide icon set: `i-lucide-*`)
- Dark cards with `bg-zinc-900` for featured sections, light `bg-zinc-50` for standard cards
- Loading states with skeleton placeholders

### File Structure
```
pages/marketing.vue                          — Main page
components/Marketing/HealthScore.vue         — Circular score component
components/Marketing/InsightCard.vue         — Reusable insight card
components/Marketing/CampaignTimeline.vue    — Campaign plan timeline view
server/api/marketing/ai-analyze.post.ts      — AI analysis endpoint
server/utils/marketing-intelligence.ts       — Data aggregation utility
types/marketing.ts                           — TypeScript interfaces
```

## Key Patterns to Follow

**API auth pattern:**
```typescript
const session = await requireUserSession(event);
const userId = (session as any).user?.id;
if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });
const directus = await getUserDirectus(event);
```

**LLM usage pattern:**
```typescript
const provider = getLLMProvider();
const response = await provider.chat(messages, {
  systemPrompt: '...',
  maxTokens: 4096,
  temperature: 0.7
});
// Parse JSON from response, strip markdown fences if present
```

**Directus query pattern:**
```typescript
import { readItems } from '@directus/sdk';
const items = await directus.request(readItems('collection_name', {
  filter: { organization: { _eq: orgId } },
  fields: ['field1', 'field2'],
  limit: 100
}));
```

## What NOT to Build Yet (Phase 2+)
- Drip campaign builder (Phase 3)
- Monthly content calendar AI (Phase 3)
- Client churn/upsell intelligence (Phase 4)
- Automated performance reports (Phase 4)
- ROI tracking (Phase 4)
- New Directus collections for storing campaign plans (just return from AI for now)

## References
- Full concept doc: `.claude/prompts/ai-marketing-strategy-engine.md`
- Email wizard example: `components/Newsletter/AIEmailWizard.vue`
- Social wizard example: `components/Social/AISocialWizard.vue`
- AI endpoint example: `server/api/social/ai-generate.post.ts`
- LLM factory: `server/utils/llm/factory.ts`
- Directus types: `types/directus.ts`
- AI Command Center (existing pattern): referenced in README
