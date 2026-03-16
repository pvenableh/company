# AI Marketing Strategy & Analysis Engine

## Core Concept

An AI-powered marketing intelligence layer that leverages Earnest's unified data model to generate holistic marketing strategies. Because contacts, projects, invoices, social media, emails, scheduling, phone calls, and team communications all live in one system, the AI can analyze cross-module patterns and generate actionable marketing plans that isolated tools (Mailchimp, Hootsuite, HubSpot) fundamentally cannot.

**The key differentiator**: A social media tool only sees social data. An email tool only sees email data. Earnest sees everything — and AI can connect the dots across all of it.

## What It Analyzes

### Data Sources (already in the system)

| Collection | Marketing Signals |
|---|---|
| `contacts` | Customer segments, tags, subscription status, engagement history, custom fields |
| `clients` | Industry verticals, status (active/prospect/churned), lifetime value signals |
| `social_posts` | Content performance by platform, posting frequency, engagement patterns |
| `social_analytics_snapshots` | Follower growth trends, engagement rates, reach/impressions over time |
| `emails` / `email_templates` | Campaign history, open/click rates, which content resonates |
| `mailing_lists` / `mailing_list_contacts` | Audience segmentation, list growth, subscriber behavior |
| `projects` / `project_events` | What the business is working on, upcoming launches, milestones |
| `invoices` | Revenue patterns, seasonal trends, top-performing services |
| `tickets` | Common client requests, pain points, FAQ patterns |
| `channels` / `channel_messages` | Internal discussions, team priorities, brand voice patterns |
| `scheduler_appointments` | Client meeting frequency, consultation patterns |
| `phone_calls` (if exists) | Call volume, follow-up patterns |

## Feature Areas

### 1. Marketing Dashboard / Overview

A dedicated page (`/marketing` or `/command-center/marketing`) that shows:

- **Marketing health score** — Composite metric based on content consistency, audience growth, engagement trends, email performance
- **Content velocity** — How often you're publishing across channels (social, email, blog)
- **Audience growth** — Unified view of followers + subscribers + new contacts over time
- **Campaign timeline** — Visual timeline of past and planned marketing activities
- **Quick insights** — AI-generated observations ("Your LinkedIn engagement is 3x higher than Facebook — consider shifting focus")

### 2. Campaign Planner

AI generates multi-channel campaign plans based on a business goal:

**Input**: "We're launching a new service next month" or "We want to re-engage churned clients" or "We need to build awareness in the healthcare vertical"

**Output**: A structured campaign plan with:
- **Timeline** — Week-by-week breakdown of activities
- **Email sequence** — Drip campaign with subject lines, send timing, audience segments (can feed into AI Email Wizard)
- **Social content calendar** — Platform-specific posts for each phase (can feed into AI Social Wizard)
- **Website/promotion ideas** — Landing page copy, blog post topics, case study suggestions
- **Audience targeting** — Which contact segments/mailing lists to target, based on actual data
- **KPI targets** — Suggested metrics to track based on historical performance

### 3. Content Strategy Recommendations

AI analyzes existing content performance and suggests:

- **Topic gaps** — "You post about X frequently but never about Y, which your prospects care about"
- **Platform optimization** — "Your video content performs 4x better on Instagram than LinkedIn — create more Reels"
- **Timing insights** — "Your Tuesday morning posts get 2x engagement — schedule more content then"
- **Audience alignment** — "Your email audience skews toward existing clients, but your social follows are mostly prospects — tailor content accordingly"
- **Competitor-style analysis** — Based on industry vertical, suggest content themes and formats

### 4. Drip Campaign Generator

Given a goal and audience, AI creates a complete email drip sequence:

- **Sequence structure** — Number of emails, spacing, triggers
- **Per-email briefs** — Subject line, key message, CTA, tone
- **Segment recommendations** — Which contacts/lists to include
- **Integration with Email Wizard** — Each email in the sequence can be expanded into a full template using the existing AI Email Wizard
- **A/B test suggestions** — Alternate subject lines or send times

### 5. Social Content Calendar AI

Beyond the per-post wizard, a higher-level planner:

- **Monthly content plan** — AI suggests a balanced content mix for the month (X announcements, Y behind-the-scenes, Z thought leadership)
- **Platform distribution** — Which platforms get which content types
- **Hashtag strategy** — Recurring and campaign-specific hashtag recommendations
- **Content repurposing** — "Turn this email campaign into 3 social posts" or "This project milestone would make great behind-the-scenes content"

### 6. Client & Contact Intelligence

AI analyzes CRM data for marketing insights:

- **Churn risk signals** — "3 clients haven't had activity in 60 days — consider a re-engagement campaign"
- **Upsell opportunities** — "These clients use service A but not B — create a cross-sell campaign"
- **Referral candidates** — "These clients have high engagement — consider a referral program"
- **Prospect nurturing** — "15 prospects have been in pipeline 30+ days — trigger a nurture sequence"

### 7. Performance Reports

AI-generated marketing reports:

- **Weekly/monthly summaries** — What was published, engagement metrics, audience changes
- **Campaign retrospectives** — "Your product launch campaign reached X people, generated Y leads, and Z meetings"
- **ROI analysis** — Connect marketing activities to revenue (via invoices/projects)
- **Recommendations** — "Based on this month's performance, here's what to do differently next month"

## Technical Architecture

### API Endpoint — `server/api/marketing/ai-analyze.post.ts`

- Authenticated endpoint
- Accepts: `{ analysisType, goal?, timeframe?, segments? }`
- Fetches relevant data across multiple Directus collections
- Builds a comprehensive context prompt with real business data
- Returns structured JSON with recommendations, plans, and actionable items

### Data Aggregation Layer — `server/utils/marketing-intelligence.ts`

A utility that gathers and summarizes data across modules:

```
getMarketingContext(orgId): {
  contacts: { total, byStatus, recentGrowth, topTags },
  social: { accountsByPlatform, recentPosts, engagementTrends },
  email: { campaignHistory, avgOpenRate, avgClickRate, listSizes },
  projects: { activeProjects, upcomingMilestones },
  clients: { byStatus, byIndustry, recentChurn },
  revenue: { monthlyTrend, topServices },
}
```

This aggregated context is what makes the AI recommendations powerful — it's a business snapshot no single tool can provide.

### UI Components

- `components/Marketing/StrategyDashboard.vue` — Overview page
- `components/Marketing/CampaignPlanner.vue` — Campaign creation wizard
- `components/Marketing/ContentCalendarAI.vue` — AI-powered content planning
- `components/Marketing/InsightCard.vue` — Reusable insight/recommendation cards
- `components/Marketing/DripBuilder.vue` — Drip sequence planner

### Integration with Existing AI Wizards

The marketing engine acts as an **orchestrator** that can call into existing tools:

- Campaign plan says "send email about X" → user clicks → opens AI Email Wizard pre-filled with that brief
- Campaign plan says "post about Y on LinkedIn" → user clicks → opens AI Social Wizard pre-filled
- This creates a seamless flow from strategy → execution

## Implementation Phases

### Phase 1: Marketing Dashboard + Basic Insights
- Data aggregation utility across collections
- Simple dashboard with health score, content velocity, audience growth
- AI-generated quick insights (5-10 observations based on data)

### Phase 2: Campaign Planner
- Multi-channel campaign generation from a goal description
- Timeline view with email + social + promotion activities
- Integration hooks to Email and Social AI wizards

### Phase 3: Drip Campaigns + Content Calendar
- Drip sequence generator with email briefs
- Monthly content calendar planner
- Content repurposing suggestions

### Phase 4: Client Intelligence + Reports
- CRM-based marketing signals (churn, upsell, nurture)
- Automated performance reports
- ROI tracking across marketing → revenue

## Key Differentiator Messaging

For the sellsheet and marketing:

> "Most marketing tools see one channel. Earnest sees your entire business. That's why its AI doesn't just write posts — it builds strategies. It knows your clients, your projects, your revenue, your team's conversations, and your audience's behavior. It connects a churning client to a re-engagement email to a social campaign to a follow-up call. No isolated app can do that."

## Dependencies

- Existing: `getLLMProvider()` from `server/utils/llm/factory.ts`
- Existing: AI Email Wizard + AI Social Wizard (as execution endpoints)
- Existing: All Directus collections (contacts, clients, social_posts, emails, etc.)
- New: Marketing data aggregation utility
- New: Marketing-specific Directus collections (campaign plans, content calendars, marketing reports)
