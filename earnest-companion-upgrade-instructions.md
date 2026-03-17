# Earnest Companion — Upgrade Instructions for Claude Code

Feed this entire file to Claude Code inside the **earnest-companion** repo. Read every section before writing a single line of code. Paths are relative to the repo root.

---

## 0. What This Upgrade Delivers

The main company platform (`pvenableh/company`) has received major updates since the last companion sync: a full **CRM Intelligence Engine** (brand-aware, 4 analysis modes), a **Unified People CRM** (federating contacts + CardDesk), an **AI Action Board** dashboard, and an updated **notification trigger system**. This upgrade brings all of that to the companion PWA, fixes existing field-name bugs, and aligns the design with the company app's dark slate aesthetic.

### New capabilities after this upgrade

| Feature | Description |
|---------|-------------|
| **Fifth nav tab: AI** | Powered by the same CRM Intelligence Engine as the company app |
| **Smart Prompt** | One-sentence directive telling the user exactly what to focus on |
| **Priority Actions** | Ranked list of concrete next steps across tickets, projects, invoices, leads, tasks |
| **CRM Health Score** | 0–100 score with 5-category breakdown (clientRelationships, pipelineHealth, followUpConsistency, revenueGrowth, networkingEffort) |
| **Insights** | Typed observations: strength, risk, trend, opportunity — with data points and channel attribution |
| **Growth Opportunities** | Actionable suggestions with effort level, potential impact, and step-by-step instructions |
| **4 Analysis Modes** | Overview, Contact Strategy, Growth Plan, Pipeline Review — matching the company app exactly |
| **Brand-Aware AI** | All suggestions incorporate org brand direction, goals, target audience, location, and client services |
| **CardDesk Integration** | Personal networking CRM data (cd_contacts, cd_activities, cd_xp_state) feeds into intelligence |
| **Push notifications** | For directus_notifications, comments, reactions, messages (channels), ticket/project updates |
| **All existing bugs fixed** | Wrong collection names, wrong field names on score and notifications |

---

## 1. Tech Stack Constraints — Read Before Coding

| Rule | Detail |
|------|--------|
| Framework | Nuxt 4, `future: { compatibilityVersion: 4 }`, app dir under `app/` |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite`. No `tailwind.config.js`. No arbitrary values unless already present. |
| No NuxtUI | All UI is raw Tailwind + `@nuxt/icon`. No component library. |
| Icons | `i-heroicons-*` names only. Use `<Icon name="..." class="..." />`. |
| Auth | `useUserSession()` on client. `getUserSession(event)`, `clearUserSession(event)`, `replaceUserSession(event, ...)` on server. |
| Directus client | `getUserDirectus(event)` from `server/utils/directus.ts` for user-scoped calls. `getAdminDirectus()` for server-only. `getServerDirectus()` for full admin. Never create a raw client in a route handler. |
| LLM | Always use `getLLMProvider()` from `server/utils/llm/factory.ts`. Never import Anthropic SDK directly in route handlers. The provider exposes `chat()` and `chatStream()` methods. |
| No new dependencies | Do not add any new packages to `package.json` without explicit instruction. All needed packages are already installed. |

---

## 2. Design System — CSS Variables

All UI must use these variables from `app/assets/css/main.css`. Never use hardcoded hex colors.

### Existing variables (already in main.css)

```css
--color-bg: #0f172a;
--color-surface: #1e293b;
--color-surface-2: #334155;
--color-border: #334155;
--color-text: #f1f5f9;
--color-text-muted: #94a3b8;
--color-accent: #3b82f6;
--color-accent-hover: #2563eb;
--color-online: #22c55e;
--color-offline: #64748b;
--color-danger: #ef4444;
```

### Add these new variables to `app/assets/css/main.css` (append after existing `:root` block)

```css
/* AI Command Center */
--color-ai: #7c3aed;
--color-ai-hover: #6d28d9;
--color-ai-surface: rgba(124, 58, 237, 0.12);
--color-ai-border: rgba(124, 58, 237, 0.35);
--color-growth: #059669;
--color-growth-surface: rgba(5, 150, 105, 0.12);
--color-growth-border: rgba(5, 150, 105, 0.35);
--color-warning: #d97706;
--color-warning-surface: rgba(217, 119, 6, 0.12);
--color-warning-border: rgba(217, 119, 6, 0.35);
--color-critical: #dc2626;
--color-critical-surface: rgba(220, 38, 38, 0.12);
--color-critical-border: rgba(220, 38, 38, 0.35);
```

### Established UI patterns (copy exactly from existing pages)

- **Page wrapper:** `<div class="h-full flex flex-col" style="background-color: var(--color-bg)">`
- **Header:** `<header class="flex items-center justify-between px-4 py-3 border-b border-slate-700 pt-safe shrink-0" style="background-color: var(--color-surface)">`
- **Section label:** `<h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">`
- **Card:** `class="rounded-xl border border-slate-700 overflow-hidden" style="background-color: var(--color-surface)"`
- **Scrollable body:** `<div class="flex-1 overflow-y-auto">`
- **Primary button:** `class="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-500 transition-colors disabled:opacity-50"`
- **Secondary button:** `class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-600 text-slate-200 hover:bg-slate-500 transition-colors"`
- **Loading:** `<Icon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />`
- **Safe areas:** `.pt-safe` on headers, `.pb-safe` on bottom elements and tab bar

---

## 3. Phase 1 — Bug Fixes (Complete These First)

### 3.1 — `server/api/activity/feed.get.ts`

The current code reads from a custom notifications collection that does not exist in Directus. The real collection is `directus_notifications` with different field names.

Replace the entire `readItems` call with:

```ts
const notifications = await directus.request(
  readItems('directus_notifications', {
    filter: {
      recipient: { _eq: userId },
    },
    fields: [
      'id',
      'subject',        // was: title — does not exist in directus_notifications
      'message',
      'status',         // was: read — values are 'inbox' or 'read' (not boolean)
      'collection',
      'item',           // was: item_id — actual field name is 'item'
      'date_created',
      'sender.id',
      'sender.first_name',
      'sender.last_name',
      'sender.avatar',
    ],
    sort: ['-date_created'],
    limit,
    offset: (page - 1) * limit,
  }),
) as any[];

return notifications;
```

### 3.2 — `server/api/activity/mark-read.post.ts`

Update field names to match `directus_notifications`:

```ts
// Single item — replace:
await directus.request(updateItem('directus_notifications', id, { status: 'read' }));
// was: updateItem('notifications', id, { read: true })

// Mark all — replace filter and data:
await directus.request(
  updateItems('directus_notifications', {
    filter: {
      recipient: { _eq: userId },
      status: { _eq: 'inbox' },          // was: read: { _eq: false }
    },
    data: { status: 'read' },             // was: { read: true }
  } as any),
);
```

### 3.3 — `app/pages/activity.vue`

Update template bindings to use corrected field names:

- `n.title` → `n.subject`
- `n.read` (boolean check) → `n.status === 'read'`
- `n.item_id` → `n.item`

Update `unreadCount` computed:

```ts
const unreadCount = computed(() =>
  notifications.value.filter(n => n.status === 'inbox').length,
);
```

### 3.4 — `server/api/score/me.get.ts`

The `earnest_scores` collection uses different field names. Replace the fields array:

```ts
fields: [
  'id',
  'total_ep',          // was: total_score
  'current_score',     // new field not previously queried
  'level',
  'streak',            // was: streak_days
  'best_streak',       // was: longest_streak
  'dimension_scores',  // was: dimensions
  'badges_unlocked',   // was: badges
  'date_updated',
],
```

Add a mapping object to the return so the template doesn't need to change:

```ts
if (scores.length === 0) return { score: null };

const raw = scores[0] as any;
return {
  score: {
    id: raw.id,
    total_score: raw.total_ep,
    current_score: raw.current_score,
    level: raw.level,
    streak_days: raw.streak,
    longest_streak: raw.best_streak,
    dimensions: raw.dimension_scores,
    badges: raw.badges_unlocked,
    date_updated: raw.date_updated,
  },
};
```

### 3.5 — `server/api/score/leaderboard.get.ts`

Apply the same field-name fix:

```ts
fields: [
  'id',
  'total_ep',
  'level',
  'streak',
  'user.id',
  'user.first_name',
  'user.last_name',
  'user.avatar',
],
```

Map on return:

```ts
return leaderboard.map((entry: any) => ({
  id: entry.id,
  total_score: entry.total_ep,
  level: entry.level,
  streak_days: entry.streak,
  user: entry.user,
}));
```

---

## 4. Phase 2 — Enhanced Push Notification Routing

The `server/api/push/notify.post.ts` webhook currently only handles chat messages. We need it to accept targeted delivery (to a specific user) and carry a configurable URL, title, body, and tag — so it can serve all notification types.

### 4.1 — Rewrite `server/api/push/notify.post.ts`

Replace the entire handler with this updated version:

```ts
// server/api/push/notify.post.ts
import webPush from 'web-push';
import { readItems, deleteItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  // Validate webhook secret
  if (body.secret !== config.flowWebhookSecret) {
    throw createError({ statusCode: 403, message: 'Invalid webhook secret' });
  }

  const {
    // Legacy chat fields (kept for backward compatibility)
    sessionId,
    visitorName = 'Visitor',
    messagePreview,
    // New generic fields
    title,
    body: notifBody,
    userId,          // If set, only send to this user's subscriptions
    url = '/',
    tag,
    badgeCount: bodyBadgeCount,
  } = body;

  webPush.setVapidDetails(
    `mailto:support@huestudios.company`,
    config.public.vapidPublicKey,
    config.vapidPrivateKey,
  );

  const adminDirectus = getAdminDirectus();

  // Resolve badge count
  let badgeCount = bodyBadgeCount ?? 1;
  if (!bodyBadgeCount && sessionId) {
    try {
      const activeSessions = await adminDirectus.request(
        readItems('chat_sessions', {
          filter: { status: { _eq: 'active' } },
          aggregate: { count: ['id'] },
        }),
      ) as any[];
      badgeCount = activeSessions[0]?.count?.id || 1;
    } catch { /* fallback */ }
  }

  // Build the subscriptions query — targeted or broadcast
  const subQuery: any = {
    fields: ['id', 'endpoint', 'keys_p256dh', 'keys_auth'],
    limit: 500,
  };
  if (userId) {
    subQuery.filter = { user: { _eq: userId } };
  }
  const subscriptions = await adminDirectus.request(
    readItems('push_subscriptions', subQuery),
  ) as any[];

  // Resolve notification text
  const notifTitle = title || (visitorName ? `New message from ${visitorName}` : 'Earnest');
  const notifBody2 = (notifBody || messagePreview || 'Tap to open').substring(0, 100);
  const notifTag = tag || (sessionId ? `chat-${sessionId}` : 'earnest-notification');
  const notifUrl = url || (sessionId ? '/' : '/activity');

  const payload = JSON.stringify({
    title: notifTitle,
    body: notifBody2,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: notifTag,
    renotify: true,
    data: { url: notifUrl, sessionId, badgeCount },
  });

  const expiredIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub: any) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          payload,
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) expiredIds.push(sub.id);
      }
    }),
  );

  if (expiredIds.length > 0) {
    try {
      await adminDirectus.request(
        deleteItems('push_subscriptions', { filter: { id: { _in: expiredIds } } }),
      );
    } catch { /* ignore cleanup errors */ }
  }

  return { sent: subscriptions.length - expiredIds.length, expired: expiredIds.length };
});
```

### 4.2 — Directus Flows to Create

Create these Flows in the Directus admin panel (`/admin/flows`). Each is a Webhook trigger that calls the companion's `/api/push/notify` endpoint. The `FLOW_WEBHOOK_SECRET` must match the value in the companion's `.env`.

**Flow A — `directus_notifications` → targeted user push**
- Trigger: Event Hook → `items.create` on `directus_notifications`
- Operation: Webhook → `POST https://companion.huestudios.company/api/push/notify`
- Payload:
```json
{
  "secret": "{{ $env.FLOW_WEBHOOK_SECRET }}",
  "title": "{{ $trigger.payload.subject }}",
  "body": "{{ $trigger.payload.message }}",
  "userId": "{{ $trigger.payload.recipient }}",
  "tag": "notification-{{ $trigger.key }}",
  "url": "/activity",
  "badgeCount": 1
}
```

**Flow B — comments → broadcast push**
- Trigger: `items.create` on `comments`
- Payload:
```json
{
  "secret": "{{ $env.FLOW_WEBHOOK_SECRET }}",
  "title": "New comment",
  "body": "{{ $trigger.payload.comment }}",
  "tag": "comment-{{ $trigger.key }}",
  "url": "/activity"
}
```

**Flow C — reactions → broadcast push**
- Trigger: `items.create` on `reactions`
- Payload:
```json
{
  "secret": "{{ $env.FLOW_WEBHOOK_SECRET }}",
  "title": "New reaction",
  "body": "Someone reacted to your message",
  "tag": "reaction-{{ $trigger.key }}",
  "url": "/activity"
}
```

**Flow D — messages (channels) → broadcast push**
- Trigger: `items.create` on `messages`
- Payload:
```json
{
  "secret": "{{ $env.FLOW_WEBHOOK_SECRET }}",
  "title": "New channel message",
  "body": "{{ $trigger.payload.text }}",
  "tag": "message-{{ $trigger.payload.channel }}",
  "url": "/"
}
```

**Flow E — tickets update → broadcast push**
- Trigger: `items.update` on `tickets`
- Payload:
```json
{
  "secret": "{{ $env.FLOW_WEBHOOK_SECRET }}",
  "title": "Ticket updated",
  "body": "Status changed to {{ $trigger.payload.status }}",
  "tag": "ticket-{{ $trigger.key }}",
  "url": "/activity"
}
```

---

## 5. Phase 3 — AI Command Center (Primary New Feature)

The company app has a full **CRM Intelligence Engine** (`POST /api/crm/ai-intelligence`) that aggregates data from 10+ collections and produces structured JSON analysis across 4 modes. For the companion we port this engine directly, adapting the data fetching for the companion's user-scoped context (no organization selector — the companion user's org is inferred from their session).

### Company app reference files (read these for full context)

| File | Purpose |
|------|---------|
| `server/utils/crm-intelligence.ts` | Data aggregation — parallel Directus queries across contacts, cd_contacts, clients, projects, project_tasks, tickets, invoices, leads, organizations, teams |
| `server/api/crm/ai-intelligence.post.ts` | Analysis endpoint with 4 modes: overview, contact-strategy, growth-plan, pipeline-review |
| `composables/useCRMIntelligence.ts` | Client composable with 5-minute per-mode caching |
| `types/crm-intelligence.ts` | Full TypeScript types for request/response |

### Collections the company app reads (all exist in the shared Directus instance)

`contacts`, `cd_contacts`, `cd_activities`, `cd_xp_state`, `clients`, `projects`, `project_tasks`, `tickets`, `invoices`, `leads`, `organizations`, `teams`, `earnest_scores`

### Key differences from the previous instructions

The previous instructions had a simplified `server/api/ai/actions.post.ts` with inline prompts and a flat response shape. The updated version must:

1. **Use the same 4 analysis modes** as the company app: `overview`, `contact-strategy`, `growth-plan`, `pipeline-review`
2. **Include CardDesk data** — `cd_contacts` (networking contacts), `cd_activities` (touchpoint tracking), `cd_xp_state` (gamification)
3. **Include brand context** — organization brand direction, goals, target audience, location; per-client brand data; team focus/goals
4. **Return the company app's typed response shapes** — not the simplified shape from the previous instructions
5. **Match the company app's prompt engineering** — the system prompts must produce the exact JSON shapes defined in `types/crm-intelligence.ts`

### 5.1 — Update `app/components/TabBar.vue`

Insert the AI tab between Activity and Score:

```ts
const tabs = [
  { path: '/', icon: 'i-heroicons-chat-bubble-left-right', label: 'Chat' },
  { path: '/activity', icon: 'i-heroicons-bell', label: 'Activity' },
  { path: '/ai', icon: 'i-heroicons-sparkles', label: 'AI' },          // ADD THIS
  { path: '/score', icon: 'i-heroicons-trophy', label: 'Score' },
  { path: '/team', icon: 'i-heroicons-user-group', label: 'Team' },
];
```

Update the active class binding to give the AI tab a violet accent:

```ts
:class="activeTab === tab.path
  ? (tab.path === '/ai' ? 'text-violet-400' : 'text-blue-400')
  : 'text-slate-500 hover:text-slate-300'"
```

### 5.2 — Create `server/utils/crm-intelligence.ts`

Port the company app's `server/utils/crm-intelligence.ts` directly. This file contains the `getCRMContext()` function that fetches all business data in parallel. The companion version should be **identical** to the company app version, with one adaptation:

- The companion doesn't have an org selector UI, so the `orgId` must come from the user's session (their first organization).
- The function signature stays the same: `getCRMContext(directus, orgId, userId)`.

Copy the full contents of the company app's `server/utils/crm-intelligence.ts` into the companion. The function:

1. Fetches in parallel: contacts, recentContacts, clients, projects, completedProjects, tasks (from `project_tasks`), tickets, completedTickets, invoices, deals (from `leads`), convertedDeals, cdContacts (from `cd_contacts`), cdActivities (from `cd_activities`), cdXpState (from `cd_xp_state`)
2. Then fetches brand context: organization details, clients with brand data, teams with focus/goals
3. Builds summaries for: contacts (by industry, tags, email/phone counts), cardDesk (by rating, follow-ups needed, conversion rate, XP), clients (by status, active projects/tickets), projects (overdue, due soon, avg completion), tickets (by status/priority, resolution time), invoices (monthly trend, outstanding, top clients), deals (pipeline value, overdue follow-ups, conversion rate), activities (by type, response rate)
4. Returns a typed `CRMContext` object

### 5.3 — Create `types/crm-intelligence.ts`

Copy the company app's `types/crm-intelligence.ts` into the companion. This defines:

**Data types:**
- `CRMContext` — top-level aggregation context with 9 sections
- `CRMBrandContext` — org, client, and team brand data
- `CRMContactsSummary`, `CRMCardDeskSummary`, `CRMClientsSummary`, `CRMProjectsSummary`, `CRMTicketsSummary`, `CRMInvoicesSummary`, `CRMDealsSummary`, `CRMActivitiesSummary`

**Request/Response types:**
- `CRMAnalysisType` = `'overview' | 'contact-strategy' | 'growth-plan' | 'pipeline-review'`
- `CRMIntelligenceRequest` — `{ analysisType, organizationId, focus?, targetId? }`
- `CRMOverviewAnalysis` — `{ healthScore, healthBreakdown: { clientRelationships, pipelineHealth, followUpConsistency, revenueGrowth, networkingEffort }, topActions[], insights[], growthOpportunities[] }`
- `CRMContactStrategyAnalysis` — `{ segmentStrategies[], reEngagementTargets[], conversionReadyContacts[], outreachCadence, networkingTips[] }`
- `CRMGrowthPlanAnalysis` — `{ currentState, targets[], strategies[], weeklyPlan[], kpis[] }`
- `CRMPipelineReviewAnalysis` — `{ summary, stageAnalysis[], atRiskDeals[], recommendations[], forecast }`

### 5.4 — Create `server/api/ai/intelligence.post.ts`

This replaces the old `server/api/ai/actions.post.ts`. Port the company app's `server/api/crm/ai-intelligence.post.ts` with these adaptations for the companion:

```ts
// server/api/ai/intelligence.post.ts
import { getLLMProvider } from '~/server/utils/llm/factory';
import { getCRMContext } from '~/server/utils/crm-intelligence';
import type { ChatMessage } from '~/server/utils/llm/types';
import type {
  CRMIntelligenceRequest,
  CRMOverviewAnalysis,
  CRMContactStrategyAnalysis,
  CRMGrowthPlanAnalysis,
  CRMPipelineReviewAnalysis,
} from '~/types/crm-intelligence';

type AnalysisResult =
  | CRMOverviewAnalysis
  | CRMContactStrategyAnalysis
  | CRMGrowthPlanAnalysis
  | CRMPipelineReviewAnalysis;

const VALID_TYPES = ['overview', 'contact-strategy', 'growth-plan', 'pipeline-review'];

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const analysisType = body.analysisType || 'overview';
  const focus = body.focus;

  if (!VALID_TYPES.includes(analysisType)) {
    throw createError({
      statusCode: 400,
      message: `analysisType must be one of: ${VALID_TYPES.join(', ')}`,
    });
  }

  // Companion adaptation: resolve orgId from the user's session
  // (the companion has no org selector — use the user's first org)
  const orgs = (session as any).user?.organizations;
  const orgId = body.organizationId
    || orgs?.[0]?.organizations_id?.id
    || orgs?.[0]?.organizations_id;

  if (!orgId) {
    throw createError({ statusCode: 400, message: 'No organization found for user' });
  }

  const directus = await getUserDirectus(event);
  const context = await getCRMContext(directus, orgId, userId);

  const provider = getLLMProvider();
  const systemPrompt = buildPrompt(analysisType, context, focus);

  const messages: ChatMessage[] = [
    { role: 'user', content: getUserMessage(analysisType, focus) },
  ];

  try {
    const response = await provider.chat(messages, {
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.7,
    });

    let parsed: AnalysisResult;
    try {
      let content = response.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      parsed = JSON.parse(content);
    } catch {
      console.error('[ai/intelligence] Failed to parse LLM response:', response.content.slice(0, 500));
      throw createError({
        statusCode: 502,
        message: 'AI returned an invalid response. Please try again.',
      });
    }

    return parsed;
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[ai/intelligence] LLM error:', error);
    throw createError({
      statusCode: 500,
      message: 'AI intelligence unavailable. Check server logs.',
    });
  }
});
```

Then copy the **exact** `getUserMessage()`, `buildPrompt()`, `buildOverviewPrompt()`, `buildContactStrategyPrompt()`, `buildGrowthPlanPrompt()`, and `buildPipelineReviewPrompt()` functions from the company app's `server/api/crm/ai-intelligence.post.ts`. These contain the carefully engineered system prompts that produce the correct JSON response shapes. Do not simplify them.

### 5.5 — Create `app/pages/ai.vue`

Build this page mobile-first, strictly matching the dark slate design system. The page must support all 4 analysis modes and render the full response shapes.

#### Structure

```
<div.h-full.flex.flex-col>
  <header>                          ← standard header with violet sparkles icon + refresh
  <div.flex-1.overflow-y-auto>
    Loading skeleton                ← while fetching
    Error state                     ← on failure
    [when data]
    Mode selector                   ← 4 pill tabs: Overview / Contact Strategy / Growth / Pipeline
    Ask anything input (collapsible) ← freeform user prompt (maps to `focus` param)

    [mode=overview]
    Section: Health Score           ← score number + 5-bar breakdown (clientRelationships, etc.)
    Section: Top Actions            ← priority-colored cards with category + link
    Section: Insights               ← typed cards (strength=green, risk=red, trend=blue, opportunity=emerald)
    Section: Growth Opportunities   ← effort badge + steps list

    [mode=contact-strategy]
    Section: Segment Strategies     ← segment cards with action list + frequency
    Section: Re-Engagement Targets  ← reason + suggested approach + message template
    Section: Conversion Ready       ← signals list + next step
    Section: Outreach Cadence       ← daily/weekly/monthly lists
    Section: Networking Tips        ← simple list

    [mode=growth-plan]
    Section: Current State          ← summary text
    Section: Targets                ← metric/current/target/timeframe grid
    Section: Strategies             ← title + tactics + expected outcome
    Section: Weekly Plan            ← week-by-week actions
    Section: KPIs                   ← metric/target/tracking

    [mode=pipeline-review]
    Section: Summary                ← executive summary text
    Section: Stage Analysis         ← stage breakdown with bottleneck flags
    Section: At-Risk Deals          ← urgency-colored cards
    Section: Recommendations        ← impact-colored cards
    Section: Forecast               ← next month/quarter estimates + confidence + assumptions
  </div>
  <TabBar />
</div>
```

#### Implementation notes

- Call `POST /api/ai/intelligence` with `{ analysisType: mode, focus: userPrompt }`.
- Use the `CRMAnalysisType` values for the mode selector: `'overview'`, `'contact-strategy'`, `'growth-plan'`, `'pipeline-review'`.
- The response shape changes per mode — use computed properties or `v-if` to render mode-specific sections.
- Health score breakdown in overview mode has **5 categories**: `clientRelationships`, `pipelineHealth`, `followUpConsistency`, `revenueGrowth`, `networkingEffort` — render each as a labeled progress bar.
- Top actions have a `link` field (e.g. `/contacts`, `/clients`, `/carddesk`) — make these tappable on mobile.
- Insights have a `type` field: use green for `strength`, red for `risk`, blue for `trend`, emerald for `opportunity`.
- Growth opportunities have `effort` (low/medium/high) and `steps[]` — show effort as a badge and steps as a numbered list.
- Cache results per mode client-side (5-minute TTL, matching the composable pattern).

#### Display helpers

```ts
// Health score color
function scoreColor(score: number) {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBarColor(score: number) {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

// Action priority
const priorityMap = {
  urgent: { label: 'Urgent', dot: 'bg-red-500', badge: 'bg-red-900/40 text-red-300', border: 'border-red-800/60' },
  high:   { label: 'High', dot: 'bg-orange-500', badge: 'bg-orange-900/30 text-orange-300', border: 'border-orange-800/60' },
  medium: { label: 'Medium', dot: 'bg-yellow-500', badge: 'bg-yellow-900/20 text-yellow-400', border: 'border-yellow-800/60' },
  low:    { label: 'Low', dot: 'bg-slate-500', badge: 'bg-slate-700/50 text-slate-400', border: 'border-slate-700' },
};

// Insight type
const insightTypeMap = {
  strength:    { icon: 'i-heroicons-check-badge', color: 'text-green-400', bg: 'bg-green-900/20' },
  risk:        { icon: 'i-heroicons-exclamation-triangle', color: 'text-red-400', bg: 'bg-red-900/20' },
  trend:       { icon: 'i-heroicons-arrow-trending-up', color: 'text-blue-400', bg: 'bg-blue-900/20' },
  opportunity: { icon: 'i-heroicons-light-bulb', color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
};

// Category icons (for actions)
const categoryIcons = {
  followup:   'i-heroicons-phone-arrow-up-right',
  conversion: 'i-heroicons-user-plus',
  retention:  'i-heroicons-heart',
  outreach:   'i-heroicons-megaphone',
  operations: 'i-heroicons-cog-6-tooth',
};
```

---

## 6. Phase 4 — Typing Animation in `app/assets/css/main.css`

The typing dots animation already exists. Confirm these keyframes are present (they are in the existing file). No change needed unless missing:

```css
@keyframes typing-dot {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}
.typing-dot { animation: typing-dot 1.2s infinite; }
.typing-dot:nth-child(2) { animation-delay: 0.15s; }
.typing-dot:nth-child(3) { animation-delay: 0.3s; }
```

---

## 7. Verification Checklist

After all changes, verify:

- [ ] `/login` — login still works, session persists
- [ ] `/` — chat tab loads, sessions list, messages load
- [ ] `/activity` — notifications load from `directus_notifications`, unread count correct, mark-read works
- [ ] `/score` — score displays correctly with renamed fields (`total_ep` → `total_score` mapped)
- [ ] `/score` (leaderboard) — team leaderboard renders with correct scores
- [ ] `/team` — team online/offline renders
- [ ] `/ai` — page loads with spinner, fetches `/api/ai/intelligence`, overview mode renders
- [ ] `/ai` — all 4 modes work: Overview, Contact Strategy, Growth Plan, Pipeline Review
- [ ] `/ai` overview — health score with 5-category breakdown renders
- [ ] `/ai` overview — top actions with priority badges and category icons render
- [ ] `/ai` overview — insights with typed styling (strength/risk/trend/opportunity) render
- [ ] `/ai` overview — growth opportunities with effort badges and steps render
- [ ] `/ai` contact-strategy — segments, re-engagement, conversion ready, cadence all render
- [ ] `/ai` growth-plan — current state, targets, strategies, weekly plan, KPIs all render
- [ ] `/ai` pipeline-review — summary, stages, at-risk, recommendations, forecast all render
- [ ] `/ai` — "Ask anything" input sends custom `focus` prompt, result updates
- [ ] `/ai` — refresh button works, results are cached for 5 minutes
- [ ] TabBar — 5 tabs visible, AI tab uses violet active state, all routes navigate correctly
- [ ] Push notifications — webhook accepts `userId` for targeted delivery and broadcasts without it
- [ ] Build — `pnpm build` succeeds with no TypeScript errors

---

## 8. Do Not Touch

These files are correct and should not be modified unless explicitly fixing a bug introduced by this upgrade:

- `server/utils/directus.ts` — auth, refresh, admin/server/user clients, `withAuthRetry`
- `server/utils/session.ts` — session token helpers
- `server/utils/llm/` — factory, claude provider, types
- `server/api/auth/login.post.ts`, `logout.post.ts`
- `server/api/chat/` — all chat endpoints
- `server/api/push/subscribe.ts`
- `app/middleware/auth.global.ts`
- `app/composables/usePush.ts`
- `app/components/ChatMessage.vue`, `SessionList.vue`, `AISuggestButton.vue`
- `app/pages/login.vue`
- `public/push-handler.js`
- `Dockerfile`, `docker-compose.yml`, `.env.example`
- `nuxt.config.ts` — do not add modules or change the runtime config shape

---

## 9. Appendix — Key Directus Collections Reference

These are the collections the CRM Intelligence Engine reads. All exist in the shared Directus instance.

| Collection | Purpose | Key Fields Used |
|------------|---------|-----------------|
| `contacts` | Org shared contact database | id, email, phone, email_subscribed, tags, industry, organization |
| `cd_contacts` | CardDesk personal networking | id, name, company, rating, hibernated, is_client, user_created |
| `cd_activities` | CardDesk touchpoint tracking | id, type, date, is_response, contact.id, contact.name, user_created |
| `cd_xp_state` | CardDesk gamification | level, streak, total_clients, total_contacts, user_created |
| `clients` | Paying companies | id, name, status, tags, brand_direction, goals, target_audience, location, services |
| `projects` | Active projects | id, title, status, due_date, start_date, client.name, organization |
| `project_tasks` | Task items | id, status, completed, due_date, assignee_id, event_id |
| `tickets` | Support tickets | id, title, status, priority, due_date, assigned_to, client.name, organization |
| `invoices` | Billing | id, invoice_code, total_amount, invoice_date, due_date, status, bill_to.name, client.name |
| `leads` | Sales pipeline (deals) | id, status, priority, estimated_value, next_follow_up, source, converted_to_customer |
| `organizations` | Org settings + brand | id, name, brand_direction, goals, target_audience, location |
| `teams` | Team units | id, name, focus, goals, active, organization |
| `earnest_scores` | Gamification | total_ep, level, streak, best_streak, dimension_scores, badges_unlocked |
| `directus_notifications` | System notifications | id, subject, message, status, collection, item, date_created, sender, recipient |
| `people` | **NEW** unified federation layer | source, source_id, source_collection, display_name, category, rating — federation of contacts + cd_contacts (read-only for companion) |
