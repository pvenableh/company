# Earnest vs. the 2026 AI SMB-OS benchmark

**Date:** 2026-07-01
**Author:** Strategy research pass (Claude)
**Purpose:** Turn "make Earnest the best AI-synced SMB operating system" into a grounded, executable roadmap. This maps the current best-in-class 2026 benchmark against what Earnest actually ships today, then prioritises the gaps.

## Method & honesty note

Two inputs fed this document:

1. **External landscape** — a fan-out, multi-source, adversarially-verified web-research pass (23 sources fetched → 102 claims → 25 verified → 21 confirmed after 3-vote verification). Sources are primary vendor docs (HubSpot, Zoho, Zapier), Anthropic/Wikipedia for the MCP standard, and independent trade press.
2. **Internal inventory** — a file-cited audit of the Earnest codebase (`server/`, `app/`) and the CardDesk sibling repo.

**Coverage is uneven, and I'm flagging that rather than papering over it** (per our own accuracy-first voice charter). The verified evidence base is strong on **AI depth/autonomy** and **integrations/MCP**. It is **weak on real-time sync and on speed/mobile/onboarding** — those two dimensions produced *no surviving verified claims*, so their "benchmark" rows below are drawn from the internal inventory plus general engineering knowledge and are marked ⚠️ *unverified*. Treat P0/P1 items (grounded in verified research) with more confidence than the ⚠️ rows.

**Reliability caveat on autonomy:** independent 2026 critique (Gartner forecasts ~40% of agentic-AI projects cancelled by 2027; ~77% of agent projects fail to reach production; hallucination on poor data) means the capabilities below are real and shipping, but *production reliability is contested*. Human-in-the-loop (HITL) approval is the recommended operating default, not an optional extra.

---

## TL;DR — the single highest-leverage move

**Ship an Earnest MCP (Model Context Protocol) server.** It is *the* defining 2026 interoperability benchmark — HubSpot (`mcp.hubspot.com`, GA April 2026), Zoho (model-agnostic, 12+ apps), and Zapier (9,000+ apps) all ship one; MCP was donated to the Linux Foundation's Agentic AI Foundation in Dec 2025 with 10,000+ servers published. Earnest ships **none**. And Earnest is unusually well-positioned to close this fast: it already has an LLM tool-execution layer (`server/utils/llm/tool-handlers.ts`) whose handlers can be re-exposed as MCP tools. This one project simultaneously advances "AI depth," "integrations," and the literal meaning of "AI-synced." (An `mcp-builder` skill exists to scaffold it.)

---

## Dimension 1 — AI depth & autonomy

**2026 benchmark (verified).** The market has shifted from chat/insights to *agentic autonomy*: agents that plan and execute multi-step, cross-module workflows toward a goal with minimal per-step supervision, distinct from reactive chatbots (ClickUp, monday.com, Guideflow; Gartner: 40% of enterprise apps to feature task-specific agents by end of 2026, up from <5% in 2025). Concretely, leaders ship:
- End-to-end CRM/sales agents (research prospect → qualify → draft outreach → schedule/send → monitor replies → update pipeline). *HubSpot Breeze Prospecting Agent, Salesforce Agentforce SDA.*
- Autonomous cross-module actions (close a ticket → update linked task → fire notification; resolve support tickets end-to-end incl. replying + updating CRM). *ClickUp AI Agents/Brain.*
- **No-code agent builders** from a natural-language description, with parallel multi-agent roles. *monday.com Agent Factory, ClickUp custom agents.*
- **HITL approval as a standard governance pattern** — approval checkpoints, permission-before-consequential-action, audit trails.
- Emerging commercial norms: outcome-based pricing (HubSpot ~$0.50/resolved conversation, ~$1/qualified lead), multi-channel deployment (9+ channels: web/email/SMS/WhatsApp/IG/Slack/…).

**Earnest today.** Stronger than expected — Earnest is *already partially agentic*:
- Two-round tool-use flow in `server/api/ai/chat.post.ts` with real mutation tools: `reschedule_project` (cascades dates to events+tasks), `update_field`, `add_task` (`server/utils/llm/tool-handlers.ts`), gated on `allowMutations`.
- Rich advisory AI: coaching, goal retrospectives, meeting recaps (Daily transcript sync), email/social/proposal generation, greetings, agendas.
- Background/proactive infra: BullMQ `ai-jobs` queue + `earnest-worker` (`recap-meeting`, `digest-project`), cron digests + reminders, AI notices.
- Layered system-prompt builder + 3-tier context broker (`context-broker.ts`). Claude Sonnet/Haiku/Opus with per-org token enforcement.

**Gap.** Tool surface is narrow (projects/tasks/invoices only — no contacts/leads/email-send/calendar/social actions). No autonomous *multi-step* workflows (single-shot tool calls, not planned sequences). No agent/automation *builder* for users. No formal HITL approval + audit UI. Generation ≠ action: AI drafts emails/social but cannot send/publish.

**Recommendations (priority).**
- **P0** — Expand the tool registry to cover contacts, leads, email-send, calendar events, and social publish, *each behind a HITL approval step* (proposed-action card → user confirms → execute + log). Reuse the existing two-round flow.
- **P1** — Add an audit/action-history log for every AI mutation (also a compliance table-stake).
- **P1** — Proactive background agents on the existing worker: daily briefing, stale-lead nudge, overdue-invoice chase-draft — surfaced as approvals, not silent sends.
- **P2** — A no-code "recipe"/agent builder (natural-language → scoped multi-step automation). Larger lift; sequence after the tool surface + approval rails exist.

---

## Dimension 2 — Real-time sync & cohesion ⚠️ *benchmark unverified*

**2026 benchmark (⚠️ not substantiated by verified research; directional).** One living system, not bolted-together modules: reactive backend that keeps every client in sync, optimistic updates with automatic rollback, real-time presence/collaboration, and increasingly local-first / CRDT-based offline sync. ("AI-synced" in market terms turned out to mean *MCP interop* far more than real-time data sync — see Dimension 3.)

**Earnest today.** This is arguably Earnest's *strongest* dimension already:
- Directus realtime over a single multiplexed WebSocket (`useWebSocketManager.ts`) with exponential-backoff reconnect; used by tasks, appointments, notifications, tickets, chat.
- Optimistic updates + mutation-ID de-dup + rollback-on-failure (`useDirectusItems.ts`).
- 3-tier context caching (in-memory / Directus snapshot / live) with stale-while-revalidate.
- Presence tracking (WebSocket, 150s TTL). Shared Directus spine across Earnest + CardDesk.

**Gap.** Last-write-wins (no conflict resolution). Collection-level, not field-level, subscriptions. **Earnest main-app PWA/offline is disabled** (scaffolding present in `nuxt.config.ts`; CardDesk's PWA *is* enabled). No CRDT/local-first offline editing.

**Recommendations.**
- **P1** — Enable the Earnest PWA + offline shell (scaffolding already exists; CardDesk is the proof-of-pattern).
- **P2** — Field-level subscriptions + basic conflict handling (version/updated_at guard) for concurrently-edited records.
- **P3** — Evaluate local-first/CRDT only if offline editing becomes a real user demand; it's a large architectural bet.

---

## Dimension 3 — Integrations & ecosystem

**2026 benchmark (verified).** The headline: **a production MCP server** exposing your app's data + actions to any MCP-compatible AI client, with governance (per-app scoping, action approve/block, exportable audit log — cf. Zapier's April 2026 enterprise controls). The consensus "AI-agent-ready" reference architecture is five traits: (1) open-protocol AI connectivity (MCP), (2) grounding in real-time unified business data, (3) enterprise agent governance, (4) copilot→autonomous scaling, (5) stack integration without brittle custom glue. Classic table-stakes (accounting, calendars, comms, payments, Zapier/Make) remain expected baselines.

**Earnest today.** Broad *classic* integration coverage: Stripe (subscriptions + Connect + webhooks), Daily.co video, Twilio SMS/voice (sub-account isolation), SendGrid email + event webhooks, Google/Outlook/iCal calendar, LinkedIn OAuth, Meta/Facebook webhook. Native + SSO auth.

**Gap.** **No MCP server** (the defining 2026 gap). No accounting integration (QuickBooks/Xero). No Zapier/Make. No documented public API/SDK or third-party webhook management. No WhatsApp. No MCP-style governance/audit surface.

**Recommendations (priority).**
- **P0** — **Ship the Earnest MCP server** (see TL;DR). Re-expose `tool-handlers.ts` mutations + read queries as MCP tools over OAuth; ship the governance trio (scoping, approve/block, audit log). This *is* trait (1) and materially advances (3) and (5).
- **P1** — QuickBooks/Xero accounting sync (the most-demanded absent classic integration for SMBs).
- **P1** — A documented public REST API + webhook management (also unlocks Zapier/Make with minimal extra work).
- **P2** — WhatsApp channel (extends existing Twilio comms).

---

## Dimension 4 — Speed, mobile & onboarding ⚠️ *benchmark unverified*

**2026 benchmark (⚠️ not substantiated by verified research; directional).** Fast time-to-value (top-quartile B2B SaaS reaches first value in ~5–9 days), Core Web Vitals pass, mobile/PWA parity, and AI-assisted onboarding + template libraries that compress setup. (These figures come from unverified fetches; treat as directional targets, not confirmed benchmarks.)

**Earnest today.** SSR, `@nuxt/image`, 1-week static cache headers, virtualised long lists, context-broker caching. iOS-native UX investments: haptics (`useHaptic.ts`), slide-over stack nav, AppBottomSheet. Separate `earnest-companion` PWA. Multi-step org signup wizard (`organization/new.vue`) with Stripe checkout; guide page + dismissible intro cards; demo-login endpoints.

**Gap.** Main-app PWA disabled. No template library (projects/goals/contacts). Onboarding is form-based — no guided/AI-assisted walkthrough. No time-to-value instrumentation or signup-funnel analytics. No native app-store app (PWA/companion only).

**Recommendations.**
- **P1** — AI-assisted onboarding: seed a first org from a natural-language description of the business (leans on Dimension-1 tooling).
- **P2** — Template library for projects/goals/proposals to cut time-to-value.
- **P2** — Instrument time-to-first-value + onboarding funnel.
- **P2** — Enable the main-app PWA (shared with Dimension 2).

---

## Sequenced roadmap

| Priority | Item | Dimension(s) | Leverage |
|---|---|---|---|
| **P0** | Earnest **MCP server** (re-expose tool-handlers + read queries; OAuth; governance trio) | 1, 3 | Defining 2026 benchmark; Earnest already has the primitives |
| **P0** | Expand AI tool surface (contacts/leads/email-send/calendar/social) behind **HITL approval** | 1 | Turns "drafts" into governed actions |
| **P1** | AI action **audit/history log** | 1, 3 | Governance table-stake |
| **P1** | Proactive background agents (briefing, stale-lead, invoice-chase) as approvals | 1 | Worker infra already exists |
| **P1** | **QuickBooks/Xero** accounting sync | 3 | Most-demanded absent classic integration |
| **P1** | Public REST API + webhook management (→ Zapier/Make) | 3 | Ecosystem unlock |
| **P1** | Enable main-app **PWA/offline** | 2, 4 | Scaffolding exists; CardDesk-proven |
| **P1** | **AI-assisted onboarding** (NL → seeded org) | 4 | Time-to-value |
| **P2** | No-code agent/recipe builder | 1 | After tool surface + approval rails |
| **P2** | Field-level subscriptions + conflict handling | 2 | Robustness |
| **P2** | Template library; TTV instrumentation; WhatsApp channel | 3, 4 | Polish + reach |

**Where Earnest is already at/near benchmark:** real-time WebSocket sync + optimistic updates (D2), classic integration breadth (D3), partial AI tool-use (D1), iOS-native UX primitives (D4). The gaps are concentrated in **agentic autonomy breadth + governance** and **MCP/open-interop** — both of which the P0 items target directly.

---

## Sources (verified pass)

- MCP standard & adoption: Anthropic (Nov 2024 launch), Wikipedia (JSON-RPC 2.0, client-server), Linux Foundation Agentic AI Foundation (Dec 2025 donation, 10,000+ servers).
- Vendor MCP servers: `developers.hubspot.com/mcp` (GA 2026-04-13, OAuth 2.0), `zoho.com/mcp` (model-agnostic, 12+ apps), `zapier.com/mcp` (9,000+ apps, governance controls).
- Agentic definitions & shipping features: `clickup.com/blog/agentic-ai-tools`, `monday.com/blog/ai-agents/best-ai-agents`, `guideflow.com/blog/agentic-ai-tools-for-sales`, `digitalapplied.com/blog/crm-ai-agent-salesforce-hubspot-zoho-2026-guide`.
- Reference architecture: `vantagepoint.io/blog/sf/hubspot-vs-salesforce-ai-agent-ready-2026-comparison`.
- ⚠️ Dimensions 2 & 4 rest on *unverified* fetches (Convex/CRDT/local-first blogs; digitalapplied TTV & Core Web Vitals) — directional only.

## Refuted during verification (do not cite as fact)
- "Zoho MCP supports fully autonomous cross-module action without human input" (0-3).
- "HubSpot was first to GA a production MCP server / Salesforce still pilot-stage" (0-3).
- "HubSpot MCP exposes read/write across CRM+tickets+invoicing+scheduling" (1-2 — narrower than claimed).
