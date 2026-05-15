# Earnest

**Do good work.** An AI-powered business operating system built with [Nuxt 4](https://nuxt.com), [Vue 3](https://vuejs.org), and [Directus](https://directus.io) — designed around actionable experiences and intuitive movement. Every page is a surface you work from, not a report you read. Financials surface who owes you money. Your CRM shows who needs attention. Goals show one number — your progress — and what to do next. One platform replaces projects, invoicing, CRM, social media, email marketing, team channels, scheduling, goals, and AI-powered intelligence — all in one login. Because everything lives in one place, AI harnesses your entire operation to provide accurate, brand-aware suggestions and analysis that isolated apps never could. Organizations serve as the tenant boundary, with per-org roles, customizable permissions, and subscription plan gating.

### Information architecture: one destination per noun

Every noun in Earnest has a single home, and that home is both the dashboard and the work surface. Insights, analytics, and recommendations live as tabs or top-of-page sections on the same route as the noun's list — never as a sibling sidebar entry. `/contacts` houses the contact list and a People Intelligence tab; `/marketing` opens with the recommendation feed and shows campaigns, channels, and KPIs below it. Two routes for the same noun (a "list" page next to an "insights" page) creates ambiguity for the user and splits the AI's context. One destination keeps navigation simple, gives the AI a coherent surface to reason about, and makes new entities easy to slot in without reorganizing the sidebar.

Earnest ships with two companion apps: **CardDesk** — a networking CRM that turns business cards and events into relationships — and **Earnest Companion (E²)** — a mobile-first experience for tasks, messages, and AI on the go.

## Features

### Core Modules

- **Dashboard** — Actionable activity overview with ticket analytics and quick-access links
- **Ticket Management** — Kanban board with drag-and-drop, custom statuses, service tagging, organization filtering, assignment modal, and detailed activity logs
- **Project Management** — Visual Gantt-style timeline with milestones, Kanban board view, sub-tasks, event scheduling, file attachments, threaded conversations, emoji reactions, and a command-center–style project detail page with stats dashboard (ticket counts, task progress, billing totals, timeline), document uploads, invoice management, and project-scoped activity feed
- **Expenses** — Full expense tracking with table and card views, 10 categories (Software & SaaS, Hardware & Equipment, Travel, Marketing & Ads, Office & Supplies, Contractor & Freelance, Hosting & Infrastructure, Insurance, Legal & Accounting, Other), billable/reimbursable flags, receipt attachments, vendor tracking, approval workflow (draft/submitted/approved/paid/rejected), project linking, advanced filtering (category, status, date range, billable-only), monthly comparison widget with top spending categories, and quarterly projections
- **Invoicing & Payments** — Stripe-powered billing with table-first layout (default), invoice creation and editing, PDF generation (lazy-imported html2canvas + jsPDF), public payment links, and per-client billing fields (billing email, name, address, payment terms) with invoice-level billing snapshots for historical accuracy. **Rich-text line items** via TipTap on description and notes (sanitized with `dompurify`) with page-break CSS for clean print. **Time-block grouping** turns logged timer entries into HTML tables on the invoice; multi-select on the personal time tracker pulls timer blocks straight onto invoices. **Manual payment tracking** with per-method modals (cash / check / ACH / wire / other) and quick-action buttons for marking paid, with a payments card on each invoice that refreshes inline
- **Stripe Connect for Payouts** — Each org can onboard a **Stripe Connect Standard** account so invoice payments land directly in the seller's Stripe — not the platform's. Onboarding link, "Manage on Stripe" deep-link for connected accounts, refresh and return URLs all flow through `/organization` settings. Earnest takes no fee on Connect-routed invoices; the platform Stripe account still handles Earnest's own SaaS subscriptions (and is used as a fallthrough for orgs that have not connected yet)
- **Proposals & Contracts** — Block-based composer with a reusable `document_blocks` library (categories: Bio, References, Case Study, Deliverables, Pricing, Timeline, Terms, NDA, Cover, Other) for assembling pitches and agreements out of saved building blocks. Each document renders as an official, branded page (org logo + address + phone + email + website seller header, plus a cover-page layout when the first block is flagged with a page break) using the same `DocumentShell` chrome as invoices. **Convert proposal → contract** in one click; e-signature flow via public signing tokens (`/contracts/sign/[token]`); status timelines (draft → sent → accepted/signed → rejected/declined). Detail pages render the live document by default with PDF download (html2canvas + jsPDF), and toggle to Edit mode to compose blocks, set valid-until/effective dates, link contact/lead, and update metadata
- **Document Themes** — One brand-wide aesthetic applied across every invoice, proposal, and contract you send. Three themes ship out of the box: **Classic** (clean white card, sans-serif, the default), **Editorial** (warm cream paper with serif body for traditional document feel), and **Mono** (minimal black-on-white with a configurable brand accent color). Org-level setting on the Organization Overview tab; the seller's chosen theme automatically applies to every client-facing render — list pages, preview routes, public payment+signing pages, and the PDF export
- **Calendar-First CRM Hub** — Unified scheduling experience with three-column layout: CRM sidebar (today's agenda, lead follow-ups with stage colors, pipeline summary, pending requests, booking link) | interactive calendar (Reka UI) with color-coded event chips (green = video, blue = appointment, orange = follow-up) | day detail panel with quick actions. Deep lead integration: link meetings to pipeline leads, auto-fill invitee info from contacts, auto-create lead activities on meeting creation. Filter toggles for event types. Public booking links, availability management, Google Calendar and Outlook OAuth sync, iCal feed for subscribing from any calendar app, and built-in Daily.co video conferencing
- **Video Meetings & Design Review** — Daily.co rooms with **auto-recording + live transcription** kicked off the moment the host joins (live "Transcribing" pill while it runs). After the call: notes/decisions tab on the meeting page, with AI **promotion to tasks** that writes into the regular task system via `tasks.source_meeting` FK. Drop a Figma file URL on a project event and the meeting room gets a side drawer that embeds the file (`DailyIframe.wrap()`-shared) with **last-write-wins presenter handoff** — when one person changes the frame, everyone follows. An annotation canvas overlays the embed for live drawing on Figma frames, with throttled broadcast (30 pts / 60ms), normalized coords, remote-cursor fade, and auto-clear on frame change. Daily webhooks are HMAC-verified via `DAILY_WEBHOOK_HMAC`
- **Team Communication** — Slack-style channels per organization with threaded comments, @mentions, emoji reactions, and WebSocket-powered real-time messaging
- **Social Media Management** — Compose, schedule, and publish to Instagram, TikTok, LinkedIn, Facebook Pages, and Threads; AI-powered content wizard generates platform-optimized posts with tailored copy, hashtags, and image suggestions; content calendar, engagement analytics, multi-client management, and OAuth account connections
- **Email Marketing & Newsletters** — Block-based MJML newsletter builder with 17+ reusable blocks, drag-and-drop assembly, live preview, AI email wizard that generates complete templates from a brief description, mailing list management with deduplication, CSV contact import, merge-tag personalization via Handlebars, editable header/footer partials, one-click unsubscribe, "View in Browser" web links, and campaign send tracking via SendGrid
- **Branded Email Shell** — A single org-wide email shell wraps both **transactional** (welcome, invoice, password reset, notification) and **marketing** (newsletter, campaign) sends through `renderOrgEmail()`. The org's logo, brand color, reply-to address, and mailing address render into every email. Marketing sends automatically append a **CAN-SPAM footer** (physical mailing address + one-click unsubscribe); transactional sends skip it. Live preview at `/api/email/preview` covers 10 templates, and the `/organization` settings page has an Email Branding card with an iframe preview that updates as you edit
- **People & Companies (Unified CRM)** — Attention-first CRM that surfaces who needs follow-up, who owes money, and who you haven't talked to. Every person and company in one place. The `people` collection unifies contacts, clients, and CardDesk networking connections with a single relationship graph. Companies (formerly "clients") track the organizations you serve with status workflows (active, prospect, inactive, churned), industry tagging, brand direction, goals, target audience, services, and linked people/projects/tickets/invoices. People have tagging, custom fields, mailing list membership, subscription tracking, company associations, CSV import/export, **first-class partner/vendor/board/investor relationships via the `contact_connections` collection** (non-employment cross-client links with role + introduced-by tracking), and **sub-brand contact inheritance** that walks the `parent_client` chain so regular client-contacts surface on sub-brand detail pages without duplication
- **Partner ROI Attribution** — Every won lead stores its `resulting_client` FK (set automatically on conversion). A "Leads Sourced" card on each contact's detail page rolls the attribution up into a 3-bucket view (won / open / lost with closed-$ and pipeline-$ totals) plus per-client breakdown. Partners always see the card; regular contacts see it only after winning their first deal
- **Marketing Intelligence** — AI-powered marketing dashboard (`/marketing`) that aggregates data across contacts, social media, email campaigns, clients, revenue, projects, and tickets. Opens with a **recommendation feed** (the `marketing_recommendations` collection) — AI-surfaced "do this next" cards that turn into a campaign with one click. Below it: a KPI strip, action bar, email/social channel grid, Clean-Gantt timeline of active campaigns, and a marketing health score (0-100). Campaigns expand into **touches** (per-channel sends) and **per-contact variants** (`marketing_touches` / `marketing_touch_variants`) so a single campaign can ship tailored copy to different segments. Per-platform spec sheets on the social composer plus a heuristic recommendation engine to suggest the strongest channel for a given piece of content. AI-generated multi-channel campaign plans with email sequences, social posts, and KPIs
- **AI Command Center** — AI-powered productivity engine that analyzes tickets, projects, tasks, invoices, contacts, deals, channels, social media, scheduling, and phone activity to generate prioritized action items, reminders, insights, and follow-ups; includes productivity scoring (0-100), customizable AI module preferences, team chat, financial analysis, social media–style activity timeline with reactions and comments, AI usage monitoring with server-side token enforcement and Stripe-powered token purchases, concise/regular response verbosity toggle, and persona-aware time-of-day greetings; supports Claude (Anthropic), GPT (OpenAI), and Gemini (Google) backends
- **AI Contextual Sidebar** — "Ask Earnest" pane available on every entity detail page (lead, client, contact, project, invoice, ticket, team, proposal, channel, event, email template, list). The server-side **context broker** assembles a focused, tagged summary of the entity before each chat turn — `[Source: Pipeline]`, `[Source: Sourced Attribution]`, `[Source: Cross-Client Connections]`, `[Source: Client Hierarchy]`, `[Source: Email Engagement]` — so answers cite real row data instead of hallucinating. Entity-scoped chat sessions persist per user+entity and hydrate on reopen
- **AI Mutations (Tool-Use Writes)** — When an entity context is present, the sidebar can also **act**, not just answer. Claude tool use is wired to three actions: `update_field` edits any field on the current entity, `reschedule_project` cascades start/due dates across nested events and milestones, and `add_task` creates a personal task linked to the entity. The sidebar sends `allowMutations: true` automatically on entity pages, so "shift this project a week later" or "set status to in review" lands as a real write instead of advice
- **CRM Intelligence Engine** — AI-powered CRM analysis (`POST /api/crm/ai-intelligence`) that aggregates data across the unified People CRM (contacts, CardDesk networking connections, companies), projects, tasks, tickets, invoices, and deals pipeline — enriched with brand context (brand direction, goals, target audience, services) from organizations, companies, and teams. Four analysis modes: overview (health scores + actions), contact-strategy (segmentation + outreach cadence), growth-plan (targets + 4-week plan), and pipeline-review (deal analysis + revenue forecast)
- **Goals** — Intuitive goal tracking with one big progress bar, AI-powered nudges for overdue goals, and streamlined filters (Active/Completed/All). Five goal types (financial, networking, performance, marketing, custom), AI-powered goal suggestions from the productivity engine, progress tracking with periodic snapshots, and integration with the AI Command Center for goal-aware prioritization and insights
- **Organizations & Multi-Tenancy** — Multi-organization support with per-org roles (Owner, Admin, Manager, Member, Client), customizable permission matrices per role, team structures with focus and goals, member invitations, brand direction and strategy fields, subscription plan tiers, and cross-tab state sync
- **Client Access Control** — Hybrid team-based and individual user access to clients. Owner/Admin roles see all clients; Manager/Member roles see only clients assigned to their teams plus any individual user overrides. Uses `clients_teams` and `clients_directus_users` junction tables with assignment UIs on the team detail and client detail pages
- **Client Portal** — A separate, branded surface at `/portal/*` for your customers. Portal users get their own purpose-built dashboard, projects, tickets, invoices, proposals/contracts, messages, social analytics, and marketing activity views — all client-scoped automatically by middleware. Comments + emoji reactions on portal projects and tickets are **bidirectional** with staff threads, so a single conversation surface bridges your team and the client. Multi-root access lets a single portal contact see multiple client records (with an "Inherited" badge for sub-brand visibility through `parent_client` chains) and switch scope from a grouped picker. Per-category notification preferences and rail-badge unread counts. Mobile uses a bottom "More" sheet for nav. Portal users live in a dedicated `client_portal_users` collection (split out from `org_memberships` in 2026-05) and authenticate through a parallel portal-auth flow

### Supporting Features

- **Quick Tasks** — AI-powered personal task lists with day/week scheduling (Today, This Week, Later), priority levels, motivational progress messages, confetti celebrations, and optional links to tickets or project events; AI endpoint generates contextual task suggestions; Command Center widget shows top 10 tasks or a quick generator for new users
- **Activity Timeline** — Workspace-wide activity feed (`/activity`) tracking changes across projects, tickets, invoices, contacts, clients, tasks, and emails with collection-aware icons and color themes
- **Real-Time Collaboration** — WebSocket multiplexing for live updates, user presence indicators, and instant notifications
- **Email Notifications** — Transactional emails via SendGrid for invoices, appointments, password resets, and team invitations
- **Email Templates** — MJML-powered responsive email templates with block-based composition, design-time variables (`{{{triple braces}}}`), and runtime personalization (`{{double braces}}`)
- **File Storage** — AWS S3 integration with presigned URLs for secure uploads
- **Four Navigation Modes** — Choose your preferred workspace layout: **Apps** (the new default — a thin app-rail with one icon per "app" — Work, Pipeline, Financials, Engage, Marketing, Clients, Settings — and a contextual second column for sub-nav. Detail surfaces open as full-height slide-overs so the list stays visible behind. Rail position and floating/docked chrome are user-configurable.), **Spaces** (classic macOS-style sidebar with collapsible Work / Pipeline / Financials / Engage / Team sections and an in-page pill nav that mirrors the active section), **Tabs** (iPadOS-style 5-tab top bar: Work, Pipeline, Financials, Engage, Chat), or **Home** (Apple TV-style card grid with breadcrumb drill-down). Mode persists per user via localStorage. (The earlier "Hats" role-preset picker has been retired in favor of the Apps Layout's per-app surfaces.)
- **Unified Gantt Timeline** — Asana-style Gantt chart combining projects, project events, tickets, and personal tasks in a single interactive timeline. Supports nested (grouped by project) and flat (separate swimlanes) view modes, zoom controls, scroll-to-today, event selection, and expand/collapse — shown at the top of the Command Center and on the Projects page
- **Floating Dock** — Draggable desktop toolbar with quick access to Tasks, Time Tracker, and AI assistant. Snaps to any screen corner with position persistence. Shows active task count badge and live timer display
- **Theme System** — Four color themes (Glass, Ink, Mono, Chromatic) combined with four style variants (Modern, Classic, Casual, Bold). Mono and Chromatic themes generate full palettes from a single hue value. All combinations persist to localStorage with flash-of-unstyled-content prevention
- **Dark Mode** — System-aware dark/light theme with manual toggle
- **PWA** — Install as a native-feeling progressive web app on any device
- **Timeline Icon Themes** — Six swappable icon theme packs for the activity timeline (Classic/Heroicons, Animals, Food, Travel, Objects, Nature) using Fluent Emoji Flat, with per-user persistence and live-swapping via Account > Appearance settings
- **Investor Pitch Page** — Public page at `/pitch` with interactive revenue projection calculator (24-month forecast with adjustable growth rate), plan/add-on overview, unit economics, and Earnest Score breakdown
- **Branded Error Pages** — Earnest-styled error pages (404, 403, 401, 500) with status-specific messaging, editorial typography, and graceful recovery actions

### Companion Apps

- **CardDesk** — Gamified networking CRM companion app (Nuxt 4 + Directus 11). Scan business cards via Claude Vision, log follow-up activities (email, call, meeting, LinkedIn), track lead ratings (hot/warm/nurture/cold), and convert contacts to clients — all wrapped in an XP/level/badge system. Uses `cd_`-prefixed Directus collections (`cd_contacts`, `cd_activities`, `cd_xp_state`) on the shared Directus instance, feeding into the unified People CRM
- **Earnest Companion (E²)** — Mobile-first companion app for managing your business on the go. Quick access to tasks, team messages, AI assistant, and key metrics from your phone

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Nuxt 4, Vue 3, TypeScript |
| UI | shadcn-vue, Tailwind CSS v4, Reka UI |
| Icons | @nuxt/icon (Heroicons, Lucide, Material Symbols) |
| CMS / Backend | Directus (headless) |
| Auth | nuxt-auth-utils + Directus Auth |
| Payments | Stripe |
| AI | Anthropic Claude, OpenAI GPT, Google Gemini |
| Email | SendGrid, MJML, Handlebars |
| Video | Daily.co (prebuilt iframe UI) |
| Voice / SMS | Twilio (per-org sub-accounts) |
| Calendar | Google Calendar API, Microsoft Outlook (Azure), iCal feed |
| Social | Instagram Graph API, TikTok API, LinkedIn API, Facebook Pages API, Threads API |
| Storage | AWS S3 |
| Charts | Chart.js, Unovis |
| Animations | GSAP, VueUse Motion |
| Forms | VeeValidate, Yup, Zod |
| Rich Text | TipTap |
| Tables | TanStack Vue Table |
| Analytics | Google Analytics (nuxt-gtag) |
| Package Manager | pnpm |

## Domain Architecture

| Domain | Purpose |
|---|---|
| `earnest.guru` | Marketing site (separate repo: `earnest-marketing`) |
| `app.earnest.guru` | Main application platform (this repo) |
| `admin.earnest.guru` | Directus admin / CMS backend |
| `companion.earnest.guru` | Default Companion PWA |
| `{orgslug}.earnest.guru` | White-labeled Companion (add-on) |

Reserved subdomains: `app`, `companion`, `admin`, `api`, `www`, `mail`, `status`

## Prerequisites

- **Node.js** >= 22.0.0, < 23.0.0
- **pnpm** 9.x
- A running **Directus** instance

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values. At minimum you need:

| Variable | Description |
|---|---|
| `NUXT_SESSION_PASSWORD` | Random string (>= 32 chars) for session cookie encryption. Generate with `openssl rand -base64 32` |
| `DIRECTUS_URL` | URL of your Directus instance |
| `DIRECTUS_SERVER_TOKEN` | Directus server token for server-side admin operations (webhooks, cron, etc.) |
| `DAILY_API_KEY` | Daily.co REST API key for video meetings |
| `DAILY_WEBHOOK_HMAC` | HMAC secret used to verify inbound Daily.co webhooks |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV` | Plaid credentials for the Bank Sync add-on (use `sandbox` for dev) |
| `DEMO_USER_PASSWORD` / `DEMO_AGENCY_USER_PASSWORD` | Passwords for the seeded `/try-demo` users |

See [`.env.example`](.env.example) for the full list of available variables.

### 3. Generate Directus types (optional)

If you have `DIRECTUS_URL` and `DIRECTUS_SERVER_TOKEN` set:

```bash
pnpm generate:types
```

### 4. Run development server

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm preview` | Preview production build locally |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Lint with ESLint |
| `pnpm lint:fix` | Lint and auto-fix |
| `pnpm format` | Format with Prettier |
| `pnpm generate:types` | Generate TypeScript types from Directus schema |
| `pnpm clean` | Remove build artifacts and node_modules |

## Project Structure

Nuxt 4 layout — application code lives under `app/`, server code under `server/`, and shared types under `shared/`.

```
├── app/
│   ├── pages/              # Route pages (Nuxt file-based routing; includes /portal/*, /apps/*, /meetings/*)
│   ├── layouts/            # default, client-portal, auth, blank, email
│   ├── middleware/         # auth, guest, client-portal.global, active-org
│   ├── plugins/            # Client-side plugins
│   ├── composables/        # Vue composables (auth, data fetching, real-time, AI, plaid, portal scope, etc.)
│   ├── assets/css/         # Tailwind CSS v4, theme system, fonts, variables
│   └── components/
│       ├── Layout/         # AppRail, PortalRail, AppRailPositionPicker, header, footer, notifications
│       ├── Apps/           # Apps Layout app surfaces + slide-overs
│       ├── Portal/         # PortalClientSelect, PortalAccess, InviteClientModal
│       ├── Tickets/        # Kanban board, dashboard, cards
│       ├── Projects/       # Timeline, board, overview
│       ├── Invoices/       # Invoice forms, manual-payment modal, time-block tables, PDF generation
│       ├── Channels/       # Real-time messaging
│       ├── Clients/        # Client forms, cards, user access assignment
│       ├── Scheduler/      # CRM sidebar, day detail panel, event chips, meeting modals, booking
│       ├── Meetings/       # MeetingAnnotationCanvas, DesignFigmaEmbed, notes/decisions/promote tabs
│       ├── Marketing/      # Recommendation feed, KPI strip, channel grid, Clean-Gantt
│       ├── Expenses/       # Expense summary widget
│       ├── CommandCenter/  # AI tray, suggestion cards, productivity meter, preferences, quick tasks widget, activity timeline, AI chat
│       ├── Newsletter/     # Block builder, canvas, variable editor, partials, AI email wizard
│       ├── Contacts/       # Contact forms, tables, merge tag reference
│       ├── Import/         # CSV column mapper
│       ├── Social/         # Social media components, AI content wizard, per-platform spec sheets
│       ├── ProjectTimeline/# Canvas-based timeline visualization
│       ├── Comments/       # Threaded comment system (CommentsSystem)
│       ├── Reactions/      # Universal ReactionsBar
│       ├── Auth/           # Login, register, password reset, portal-auth forms
│       ├── Form/           # Reusable form components (TipTap, uploads)
│       ├── Payment/        # Stripe card and payment UI, Connect onboarding
│       ├── Tasks/          # Quick task generator with AI suggestions and schedule grouping
│       ├── Organization/   # Org settings, email branding, Stripe Connect, document theme, AI token management
│       ├── Document/       # DocumentShell, DocumentPdfGenerator, theme switcher
│       ├── Teams/          # Team management cards, modals, client assignment
│       └── ui/             # shadcn-vue base components
├── server/
│   ├── api/                # API routes (auth, directus, stripe, plaid, email, social, org, video, portal, marketing, etc.)
│   ├── adapters/           # Social media platform adapters (Instagram, TikTok, LinkedIn, Facebook, Threads)
│   ├── plugins/            # Nitro plugins (session hooks)
│   └── utils/              # Server utilities (Directus, crypto, logging, renderOrgEmail, marketing-perms, daily)
├── shared/                 # TypeScript types shared between app and server (use ~~/shared)
├── public/                 # Static assets
└── scripts/                # Setup, demo-seed, and one-off utility scripts
```

## Key Pages

| Page | Route | Description |
|---|---|---|
| Home | `/` | Dashboard (authenticated) — redirects to login if unauthenticated |
| Tasks | `/tasks` | Personal quick tasks with AI suggestions, schedule grouping, and project task views |
| Tickets | `/tickets` | Kanban board for task management |
| Projects | `/projects` | Timeline and board views for project management |
| Expenses | `/expenses` | Expense tracking with category filters, approval workflow, and summary analytics |
| Invoices | `/invoices` | Invoice list, creation, and payment tracking |
| Proposals | `/proposals` | Block-composed proposals with branded preview, PDF export, and one-click convert-to-contract |
| Contracts | `/contracts` | Block-composed contracts with public signing flow (`/contracts/sign/[token]`), branded preview, and PDF export |
| Document Block Library | `/organization/document-blocks` | Manage the reusable proposal/contract blocks (Bio, Terms, Pricing, etc.) shared across both document types |
| Activity | `/activity` | Workspace-wide activity timeline across all modules |
| Scheduler | `/scheduler` | Calendar-first CRM hub with unified events, lead integration, and video meetings |
| Channels | `/channels` | Real-time team messaging |
| Marketing Intelligence | `/marketing` | AI-powered marketing health scores, insights, and campaign planner |
| Command Center | `/command-center` | AI productivity dashboard and task analyzer |
| Command Center Chat | `/command-center/chat` | AI-powered team chat |
| Financials Hub | `/financials` | Actionable dashboard: month-over-month stats, unpaid invoices, recent expenses, revenue/expense charts, and quarterly overview |
| Quarterly Analysis | `/command-center/financials` | Detailed quarterly financial analysis and goals |
| Email Templates | `/email/templates` | Newsletter template builder |
| Email Campaigns | `/email` | Campaign management and send tracking |
| Contacts | `/contacts` | Contact CRM and mailing lists |
| Contact Import | `/contacts/import` | CSV import with column mapping |
| Email Web View | `/email/view/[id]` | Public "View in Browser" link for sent emails |
| Social Dashboard | `/social/dashboard` | Social media overview and scheduling |
| Social Compose | `/social/compose` | Create and schedule posts |
| Social Calendar | `/social/calendar` | Visual content calendar |
| Social Analytics | `/social/analytics` | Engagement and growth metrics |
| Social Clients | `/social/clients` | Agency client management |
| Social Settings | `/social/settings` | Connect and manage platform accounts |
| Clients | `/clients` | Client list with status filters and search |
| Client Detail | `/clients/[id]` | Client overview with linked contacts, projects, and tickets |
| Organization | `/organization` | Organization settings, email branding, Stripe Connect, document theme, member management |
| Teams | `/organization/teams` | Team structure and roles |
| Account | `/account` | User profile and settings |
| Public Booking | `/book/[userId]` | Client-facing scheduling page |
| Client Portal | `/portal` | Customer-facing dashboard (projects, tickets, invoices, proposals/contracts, messages, marketing activity, social analytics) — middleware-scoped to the active client |
| Portal Tickets | `/portal/tickets` | Client-facing ticket list with Submit-a-Ticket CTA |
| Try Demo | `/try-demo` | Public chooser landing for the Solo + Agency demo orgs |
| Pitch | `/pitch` | Public investor pitch page with revenue calculator |
| Contract Signing | `/contracts/sign/[token]` | Public, token-gated contract signature page |
| Meeting Room | `/meetings/[id]` | Daily.co room with notes/decisions/promote tabs, Figma side-drawer, and annotation canvas |

## Multi-Tenant SaaS Architecture

The platform uses **organizations as the tenant boundary**. Each user can belong to multiple organizations with different roles in each. Data (projects, tickets, contacts, invoices, clients) is scoped to the active organization.

### Per-Org Role System

Rather than relying on global Directus roles, the platform implements **app-level roles** stored in `org_roles` and `org_memberships`. A user can be an Admin in Org A and a Member in Org B.

| Role | Purpose | Default Access |
|---|---|---|
| **Owner** | Org creator, cannot be removed | Full access including org settings and billing |
| **Admin** | Full org access | Everything except delete org |
| **Manager** | Manages projects, clients, and teams | CRUD most features, limited org settings |
| **Member** | Works on assigned items | Read most, CRUD tasks/tickets/comments |
| **Client** | External user (customer) | Read assigned projects/tickets, create tickets/comments/messages |

### Permission Matrix

Each role has a customizable **permission matrix** stored as JSON in `org_roles.permissions`. The matrix maps 18 features to CRUD flags:

```
{ "projects": { "access": true, "create": true, "read": true, "update": true, "delete": false } }
```

Admins can customize permissions per-role via the organization settings page. The `useOrgRole()` composable exposes `canAccess(feature)`, `hasPermission(feature, action)`, `canView()`, `canCreate()`, `canEdit()`, and `canDelete()` helpers.

### Subscription Plans & Add-Ons

All plans get all features. Differentiation is seats, AI tokens, and scan credits. White-label is the one exception (agency tier + $19/mo add-on).

| Plan | Monthly | Annual | Seats | Client Portal Seats | AI Tokens/mo | Scans/mo |
|------|---------|--------|-------|---------------------|-------------|----------|
| **Solo** | $49 | $408/yr | 1 | 5 | 100K | 25 |
| **Studio** | $149 | $1,241/yr | 8 | 15 | 400K | 150 |
| **Agency** | $299 | $2,491/yr | 15 | Unlimited | 1M | 500 |

**Add-Ons** (monthly, alongside base subscription):

| Add-On | Price | What it provides |
|--------|-------|-----------------|
| Extra Seats (5-pack) | $15/mo | 5 additional team seats |
| Communications | $49/mo | Phone, SMS, video, live chat (Twilio sub-account) |
| Client Pack Starter | $29/mo | 5 client portal seats + 50K client tokens |
| Client Pack Pro | $59/mo | 10 client portal seats + 150K client tokens |
| Client Pack Unlimited | $129/mo | Unlimited client seats + 500K client tokens |
| Companion White-Label | $19/mo | Branded subdomain on earnest.guru |
| Bank Sync (Plaid) | $9/mo | Connect bank + credit-card accounts; auto-import transactions for expense reconciliation, with manual refresh |

**One-time purchases:** Token refills (100K/$9, 500K/$39, 1.5M/$99), Scan credits (100/$12, 500/$49).

The `planAllows(feature)` function in `useOrgRole()` gates only white-label by plan tier. Resource limits (tokens, scans, seats) are enforced server-side via `ai-token-enforcement.ts`. Add-on access is checked via `hasAddon(addonId)` in `useOrgRole()`.

### Directus Collections

| Collection | Purpose |
|---|---|
| `organizations` | Tenant boundary with plan tier |
| `people` | Unified CRM — contacts, clients, and CardDesk networking connections |
| `clients` | Companies an organization serves (active, prospect, inactive, churned) |
| `cd_contacts` | CardDesk networking contacts with lead ratings, conversion flags, and activity timelines |
| `cd_activities` | CardDesk touchpoints (email, call, meeting, LinkedIn, card scan, client conversion) |
| `cd_xp_state` | CardDesk per-user gamification state (XP, level, streak, badges) |
| `org_roles` | Per-org role definitions with permission matrices |
| `org_memberships` | User-to-org membership with role, status, client scope, and invitation tracking |
| `organizations_directus_users` | Legacy junction (kept for backward compatibility) |
| `expenses` | Organization-scoped expense records with categories, approval status, and project links |
| `ai_usage_log` | Server-side AI usage logging: endpoint, model, token counts, cost, session ID |
| `clients_teams` | Junction: team-to-client assignments for role-based client access |
| `clients_directus_users` | Junction: individual user-to-client access overrides |
| `earnest_scores` | Org-level Earnest Score: total EP, level, streak, 5 dimension scores, badges |
| `earnest_history` | Daily score snapshots for charts (date, score, EP earned, streak, dimensions) |
| `earnest_token_pools` | AI token pools per org with agency/client separation |
| `earnest_scan_credits` | CardDesk scan credit pools per org |
| `appointments` | Calendar events with `related_lead` M2O to leads for CRM tracking |
| `video_meetings` | Daily.co video meetings with `related_lead` M2O to leads |
| `video_meeting_attendees` | Meeting participant tracking (user or guest) with status |
| `meeting_requests` | Client-to-admin meeting request workflow with approval |
| `scheduler_settings` | Per-user scheduler config: availability, booking page, calendar sync, `ical_feed_token` |
| `availability` | Per-user weekly availability slots with break times |
| `leads` | CRM pipeline: stages, scoring, `next_follow_up`, contact/org relations |
| `lead_activities` | Lead activity log with `related_video_meeting` M2O to video_meetings |
| `client_portal_users` | Dedicated portal-user identity (split from `org_memberships role='client'` in 2026-05); supports multi-root via multiple rows |
| `meeting_notes` | Per-meeting notes, decisions, and discussion captured from `/meetings/[id]` |
| `tasks.source_meeting` | FK on `tasks` set when the AI "promote to task" tool fires from a meeting |
| `marketing_recommendations` | AI-surfaced "do this next" cards that feed the `/marketing` recommendation feed |
| `marketing_touches` | Per-channel sends inside a campaign |
| `marketing_touch_variants` | Per-contact-segment copy variants for a touch |
| `document_blocks` | Reusable proposal/contract block library (Bio, Terms, Pricing, etc.) |
| `proposals` / `contracts` | Block-composed documents with status timelines and signing tokens |
| `testimonials` | Customer testimonials for the marketing site (CMS-managed, used by earnest-marketing) |
| `partner_logos` | Partner/client logos for the marketing site carousel (CMS-managed, used by earnest-marketing) |

### Key Composables

| Composable | Purpose |
|---|---|
| `useOrganization()` | Org context: selected org, org list with membership data, org-scoped filters |
| `useOrgRole()` | Per-org role: role booleans, permission checks, client scope, `planAllows()`, `hasAddon()` |
| `useRole()` | Legacy global role checks (bridge to `useOrgRole` in progress) |
| `useClients()` | Client CRUD with org-scoping, role-based access filtering (team + individual assignments), search, status filters |
| `useQuickTasks()` | Personal task management with localStorage persistence, schedule grouping, motivational messages, and progress tracking |
| `useAIUsage()` | Client-side AI usage tracking with per-user localStorage, token estimation, and usage summaries |
| `useAIPreferences()` | Per-user AI response verbosity preference (concise/regular) with localStorage persistence |
| `useGoals()` | Goal CRUD with type filtering, progress snapshots, AI-powered goal suggestions, and org-scoping |
| `useExpenses()` | Expense CRUD with org-scoping, category/status/date filtering, aggregations, and quarterly projections |
| `useTimelineTheme()` | Activity timeline icon theme management with 6 theme packs and localStorage persistence |
| `useAITokens()` | Client-side AI token usage summary: monthly usage, budget, org balance/limit, and low-usage mode |
| `useEarnestChat()` | Shared module-level AI chat state for tray quick-chat with SSE streaming and abort support |
| `useABTest()` | A/B variant assignment (cookie-based), variant booleans, GA event tracking for conversion segmentation |
| `useAITokens()` | Org-level token balance/limit/usage with `checkTokenBudget` and `usageSummary` |

### Server Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/org/seed-roles` | Creates 5 system roles for an organization (idempotent) |
| `POST /api/org/migrate-memberships` | Converts legacy junction entries to `org_memberships` |
| `POST /api/ai/task-suggestions` | AI-generated task suggestions based on user prompt and existing tasks |
| `POST /api/ai/goal-suggestions` | AI-generated goal suggestions based on user role, projects, financials, and existing goals |
| `GET /api/ai/manage/members` | List org members with AI-enabled status, token budgets, and monthly usage |
| `POST /api/ai/manage/members` | Toggle AI access, set per-member token budgets |
| `POST /api/stripe/tokens/checkout` | Create Stripe Checkout session for token/scan package purchase |
| `POST /api/stripe/tokens/fulfill` | Stripe webhook to fulfill token purchases with idempotency |
| `POST /api/stripe/addons/subscribe` | Add a recurring add-on to the org's Stripe subscription |
| `POST /api/stripe/addons/cancel` | Remove an add-on from the org's Stripe subscription |
| `GET /api/score/me` | Current org's Earnest Score (EP, level, streak, dimensions) |
| `POST /api/score/checkin` | Daily login check-in (awards daily_login EP) |
| `GET /api/score/history` | Score history for charts (up to 90 days) |
| `GET /api/phone/numbers/search` | Search available Twilio phone numbers by area code |
| `POST /api/phone/numbers/purchase` | Purchase a phone number for an org via Twilio sub-account |
| `POST /api/video/setup-webhook` | One-time Daily.co webhook registration |
| `POST /api/org/migrate-billing-to-clients` | Migrate billing data from organizations to client-level fields (supports dryRun) |
| `GET /api/portal/scope` | Returns the portal user's accessible roots[] (with inherited sub-brands flagged) |
| `POST /api/portal/set-active-scope` | Sets `portal_active_scope` cookie to the current client root |
| `POST /api/portal/invite-client` | Idempotent invite by `(organization, user, client)` |
| `POST /api/stripe/connect/onboard` | Creates a Stripe Connect Standard onboarding link for the org |
| `POST /api/stripe/connect/dashboard` | "Manage on Stripe" deep-link for connected accounts |
| `POST /api/plaid/link-token` | Mint a Plaid Link token (requires `bank_sync` add-on) |
| `POST /api/plaid/exchange-token` | Exchange Plaid public token + persist access token |
| `POST /api/plaid/refresh` | Manual refresh for a connected Plaid item |
| `GET /api/email/preview?template=…` | Live preview for any of the 10 branded email templates |
| `POST /api/ai/promote-meeting-notes` | Turn `meeting_notes` decisions/action items into real tasks |
| `POST /api/org/cleanup-archived` | Daily Vercel cron (11:00 UTC) — purges orgs past the archive retention window (dry-run by default) |

### Migration Path

The system is designed for backward compatibility. The legacy `organizations_directus_users` junction and `useRole.ts` continue working alongside the new system. The migration endpoint converts existing user-org relationships into `org_memberships` with appropriate role mappings (Directus admin role to org admin, client manager to org manager, others to member).

## AI Command Center

The platform includes an AI-powered command center that acts as a productivity co-pilot. Because all business data — projects, contacts, invoices, social media, emails, scheduling, and communications — lives in one system, AI can see the full picture and generate insights that isolated tools never could. It analyzes data across every module and generates a prioritized, actionable task list — so your team always knows what to focus on next.

### How It Works

The AI Productivity Engine (`useAIProductivityEngine.ts`) scans 9 business modules in real-time:

| Module | What It Analyzes |
|---|---|
| Tickets | Overdue tickets, unassigned work, stale items |
| Projects | Missed milestones, upcoming deadlines, blocked tasks |
| Tasks | Personal task completion rate, overdue items |
| Invoices | Unpaid invoices, aging receivables, payment follow-ups |
| Deals & Leads | Stale leads, deals needing follow-up, pipeline health |
| Channels & Messages | Unread mentions, unanswered messages, idle channels |
| Social Media | Pending posts, engagement drops, scheduling gaps |
| Scheduling | Upcoming meetings, unconfirmed bookings, calendar conflicts |
| Phone & Activities | Missed calls, unanswered voicemails, follow-up reminders |

### Features

- **Smart Suggestions** — Categorized as actions, reminders, insights, leads, or follow-ups with priority levels
- **Productivity Score** — 0-100 score based on task completion, overdue items, and response times
- **AI Tray** — Sliding panel with quick-access suggestions, filterable by category
- **AI Preferences** — Per-user toggles to enable/disable analysis for each module
- **Multi-Provider AI** — Supports Anthropic Claude, OpenAI GPT, and Google Gemini backends (configurable in Directus settings)
- **Chat Sessions** — Persistent AI assistant conversations with context awareness
- **Financial Analysis** — Quarterly revenue goals and financial health dashboard
- **Activity Timeline** — Social media–style feed tracking activity across projects, tickets, tasks, invoices, emails, CardDesk contacts, clients, and contacts with emoji reactions, inline comments, "new items" indicator, infinite scroll, and pull-to-refresh
- **AI Usage Monitoring** — Server-side token enforcement with per-member monthly budgets and org-level balance tracking; Stripe-powered token purchases (100K/$9, 500K/$39, 1.5M/$99); subscription tier defaults (Solo 100K/mo, Studio 400K/mo, Agency 1M/mo); scan credit enforcement (Solo 25/mo, Studio 150/mo, Agency 500/mo); admin UI for toggling AI access and budgets per member; client-side usage summaries with today/week/month breakdowns; live TokenMeter component in sidebar
- **Response Verbosity** — Toggle between concise and regular AI response modes; concise mode instructs the LLM to give shorter, bullet-point answers
- **Persona-Aware Greetings** — Time-of-day–aware greeting algorithm (morning/afternoon/evening) with 3 greetings per persona (default, director, buddy, motivator) that rotate daily using a JS algorithm (no AI call)

### Directus Collections

| Collection | Purpose |
|---|---|
| `ai_preferences` | Per-user AI module toggle preferences |
| `ai_chat_sessions` | AI assistant chat session history with context |
| `ai_chat_messages` | Individual messages (user/assistant/system roles) |
| `goals` | Unified goals (scope=user/team/client/organization; category=revenue/growth/retention/learning/wellbeing/delivery/custom) with targets, current value, and progress |
| `goal_snapshots` | Periodic progress snapshots for goal tracking over time |

### Setup

1. **Create Directus collections:**
   ```bash
   pnpm tsx scripts/setup-ai-collections.ts
   ```

2. **Configure permissions:**
   ```bash
   pnpm tsx scripts/setup-ai-permissions.ts
   ```

3. **Add API keys** in Directus Settings (Settings > Project Settings):
   - `ai_anthropic_api_key` — Anthropic/Claude API key
   - `ai_openai_api_key` — OpenAI API key (optional)
   - `ai_google_api_key` — Google Gemini API key (optional)

## Client Access Control

The platform implements a hybrid client access control system that combines team-based assignments with individual user overrides. This ensures members only see the clients relevant to their work while giving admins full visibility.

### How It Works

| Role | Client Visibility |
|---|---|
| **Owner / Admin** | All clients in the organization |
| **Manager / Member** | Clients assigned to their teams + individually assigned clients |
| **Client** | Only their scoped client record |

### Directus Collections

| Collection | Purpose |
|---|---|
| `clients_teams` | Junction: assigns clients to teams (M2M) |
| `clients_directus_users` | Junction: assigns clients directly to individual users (M2M override) |

### Setup

1. **Create junction collections:**
   ```bash
   pnpm tsx scripts/setup-client-access.ts
   ```

2. **Regenerate types:**
   ```bash
   pnpm generate:types
   ```

3. **Configure Directus permissions** for the new junction collections to allow appropriate CRUD access per role.

### Key Files

| File | Purpose |
|---|---|
| `scripts/setup-client-access.ts` | Directus schema setup for junction collections and M2M relations |
| `composables/useClients.ts` | Client queries filtered by `accessibleClientIds` based on role + assignments |
| `components/Teams/ClientAssignment.vue` | UI for assigning clients to teams (team detail page sidebar) |
| `components/Clients/UserAssignment.vue` | UI for assigning individual users to clients (client detail page sidebar) |

## Client Portal

A separate, branded surface where your customers self-serve everything you've shared with them — projects, tickets, invoices, proposals, contracts, marketing activity, and conversations — without ever seeing your internal staff UI.

### Architecture

| Concern | Implementation |
|---|---|
| Layout | `app/layouts/client-portal.vue` (independent of staff app shell) |
| Routing | `app/middleware/client-portal.global.ts` redirects portal users away from staff routes, and staff users see a "View only" notice on portal pages |
| Identity | Dedicated `client_portal_users` collection (split out from `org_memberships` in 2026-05); portal-auth flow is parallel to staff auth |
| Multi-root | A single portal contact can have rows for multiple clients (e.g. parent + sub-brand); `portal_active_scope` cookie tracks the current root and `PortalClientSelect` shows a grouped picker. Sub-brand visibility walks the `parent_client` chain and shows an "Inherited" badge |
| Conversations | `ReactionsBar` + `CommentsSystem` are reused on portal projects/tickets; permissions on `directus_users.client_portal_users` (reverse o2m alias) plus a 4-branch `_or` filter on the Portal + ClientManager policies make threads **bidirectional** between staff and portal |
| Notifications | Per-category preferences; rail badges + mark-read-on-view; `emitNotification()` fan-out script seeds 8 Directus Flows |

### Portal Pages

| Route | Purpose |
|---|---|
| `/portal` | Dashboard with personalized activity, agenda, open invoices |
| `/portal/projects` + `/portal/projects/[id]` | Read-only project board + detail with Gantt (the staff "Open Project" link is hidden when `portal=true`) |
| `/portal/tickets` | Ticket list + Submit-a-Ticket CTA |
| `/portal/invoices` + `/portal/invoices/[id]` | Invoice list + detail with public-style payment flow (anonymous links redirect into the portal when the viewer is a portal user) |
| `/portal/proposals` / `/portal/contracts` | Read + sign documents (links route to staff-only routes are filtered out) |
| `/portal/messages` | Bidirectional message threads |
| `/portal/marketing` | Client's published social analytics + marketing activity view |

### Inviting Portal Users

`InviteClientModal` ships with two tabs:
1. **Contact picker** — surface existing contacts with access badges (already invited / inherited / no access)
2. **Email fallback** — invite an email that does not yet exist as a contact

The `invite-client` server route is idempotent across `(organization, user, client)` so re-invites and access-grant top-ups are safe.

## CRM Intelligence Engine

The platform includes an AI-powered CRM Intelligence Engine that reads across all business data and generates smart suggestions, actions, and growth ideas. Because contacts, clients, projects, invoices, deals, and brand context all live in one system, AI can deliver strategic recommendations that isolated CRM tools never could.

### How It Works

The CRM data aggregation utility (`server/utils/crm-intelligence.ts`) fetches data from 8+ collections in parallel — including the unified People CRM and CardDesk networking data (`cd_contacts`, `cd_activities`) — and builds a structured context snapshot. This snapshot — enriched with brand direction, goals, target audience, and services from the organization, companies, and teams — is passed to Claude for analysis.

### Analysis Modes

| Mode | What It Returns |
|---|---|
| **Overview** | CRM health score (0-100) with 5 category breakdowns, prioritized actions, insights (strengths/risks/trends/opportunities), and growth opportunities |
| **Contact Strategy** | Segment strategies with outreach cadence, re-engagement targets with message templates, conversion-ready contacts, and networking tips |
| **Growth Plan** | Current state assessment, measurable targets with timeframes, strategies with tactics, a 4-week action plan, and KPIs |
| **Pipeline Review** | Stage-by-stage deal analysis, at-risk deals with urgency levels, recommendations, and a revenue forecast with confidence rating |

### Brand-Aware AI

The engine incorporates brand context at three levels:
- **Organization** — brand direction, goals, target audience, location
- **Clients** — per-client brand direction, goals, target audience, location, and services provided
- **Teams** — focus area and goals per team

This context is injected into every AI prompt so suggestions align with the organization's actual positioning, market, and service offerings rather than generic CRM advice.

### Key Files

| File | Purpose |
|---|---|
| `types/crm-intelligence.ts` | TypeScript types for CRM context, analysis requests, and all 4 response shapes |
| `server/utils/crm-intelligence.ts` | Data aggregation utility — parallel queries across 8+ collections + brand context |
| `server/api/crm/ai-intelligence.post.ts` | API endpoint with 4 analysis-specific prompt builders |
| `composables/useCRMIntelligence.ts` | Client composable with typed getters, 5-minute caching, and auto org-scope |

## AI Content Generation

Beyond the Command Center's strategic analysis, the platform includes AI-powered content wizards that turn a brief description into ready-to-use marketing assets. Because contacts, projects, brand context, and campaign history all live in one system, AI generates content with real business awareness — not generic copy from a disconnected tool.

### AI Email Wizard

A 3-step modal (`components/Newsletter/AIEmailWizard.vue`) that generates complete email templates from a topic description. Select an email type, describe your message, choose tone and audience, and Claude generates a full multi-section email with subject line, copy, layout suggestions, and image recommendations — all mapped to your existing newsletter block library.

### AI Social Content Wizard

A 3-step modal (`components/Social/AISocialWizard.vue`) that generates platform-optimized social media posts. Select target platforms (LinkedIn, Facebook, Threads, Instagram), describe your content, set tone and audience preferences, and Claude generates uniquely tailored posts for each platform with appropriate character limits, hashtag strategies, calls-to-action, and image suggestions. Posts are saved as drafts — no connected social accounts required.

### LLM Architecture

Both wizards use a provider-agnostic LLM layer:
- `server/utils/llm/factory.ts` — `getLLMProvider()` factory with provider caching
- `server/utils/llm/claude.ts` — Anthropic Claude provider (default)
- `server/utils/llm/types.ts` — `LLMProvider` interface supporting chat, streaming, and multi-model selection

## Email Marketing System

The platform includes a full email marketing system (MailChimp replacement) built on MJML for responsive emails, Handlebars for personalization, and SendGrid for delivery.

### Architecture

- **Block Library** — 17+ reusable MJML blocks (headers, hero sections, text, images, CTAs, footers, etc.) stored in Directus and assembled into templates
- **Template Builder** — Drag-and-drop canvas where blocks are composed into complete email templates with live MJML preview
- **Header/Footer Partials** — Shared, editable partials that auto-attach to templates (toggleable per template)
- **Two-Variable System** — Design-time `{{{triple braces}}}` for template composition; runtime `{{double braces}}` for per-recipient personalization via Handlebars
- **Mailing Lists** — Named lists with deduplication, per-member custom fields, and subscriber count tracking
- **Contact CRM** — Full contact management with tags, custom fields (JSON), subscription tracking, and unsubscribe tokens
- **Campaign Tracking** — `emails` collection records send status, recipient counts, errors, and caches preview HTML for web viewing

### Directus Collections

| Collection | Purpose |
|---|---|
| `newsletter_blocks` | Reusable MJML block library |
| `email_templates` | Composed newsletter templates |
| `email_template_blocks` | Junction: blocks assigned to templates with sort order and variable overrides |
| `email_partials` | Shared header/footer partials |
| `emails` | Sent campaign records with status tracking |
| `contacts` | Contact records (migrating to unified `people` collection) |
| `mailing_lists` | Named mailing lists |
| `mailing_list_contacts` | Junction: list membership with per-member custom fields |

### Environment Variables

Add to `.env`:

```env
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=hello@yourdomain.com
SENDGRID_FROM_NAME=Your Company
```

### Seeding Blocks

To seed the block library with starter blocks:

```bash
pnpm tsx scripts/seed-newsletter-blocks.mjs
```

## Social Media Module

The platform includes a full social media management system supporting Instagram, TikTok, LinkedIn, Facebook Pages, and Threads. All platform adapters implement a shared `PlatformAdapter` interface (`server/adapters/types.ts`) for consistent OAuth, publishing, analytics, and comment handling.

### AI Content Generation

The social media module includes an AI-powered content wizard (`components/Social/AISocialWizard.vue`) that generates platform-optimized posts. The 3-step wizard collects topic, content type, tone, audience, and optional CTA preferences, then calls Claude to generate tailored content for each selected platform with appropriate character limits, hashtag strategies, and image suggestions.

**Works without connected accounts** — the AI wizard is a pure content generation tool that creates draft posts. Users can connect social accounts later to schedule and publish. This makes it useful as a standalone copywriting tool even before any OAuth setup.

Key files:
- `components/Social/AISocialWizard.vue` — 3-step wizard modal (platform selection, tone/audience, review/create)
- `server/api/social/ai-generate.post.ts` — Server endpoint using `getLLMProvider()` with platform-specific system prompts

### Architecture

Each platform has a dedicated adapter in `server/adapters/` that implements:
- **OAuth 2.0** — Authorization URL generation, code exchange, token refresh
- **Account discovery** — Fetch connected profiles, pages, or organizations
- **Publishing** — Platform-native post creation (text, image, video, carousel, articles)
- **Analytics** — Account-level metrics and post insights (where supported)
- **Comments** — Read and reply to comments/replies (where supported)

### Quick Setup

1. **Create Directus collections** — run the setup script:
   ```bash
   pnpm tsx scripts/setup-social-collections.ts
   ```

2. **Configure environment variables** — add to `.env`:
   ```env
   # Instagram (Facebook Login for Business)
   INSTAGRAM_APP_ID=
   INSTAGRAM_APP_SECRET=
   INSTAGRAM_REDIRECT_URI=https://your-domain.com/api/social/oauth/instagram/callback

   # TikTok
   TIKTOK_CLIENT_KEY=
   TIKTOK_CLIENT_SECRET=
   TIKTOK_REDIRECT_URI=https://your-domain.com/api/social/oauth/tiktok/callback

   # LinkedIn
   LINKEDIN_CLIENT_ID=
   LINKEDIN_CLIENT_SECRET=
   LINKEDIN_REDIRECT_URI=https://your-domain.com/api/social/oauth/linkedin/callback

   # Facebook Pages
   FACEBOOK_APP_ID=
   FACEBOOK_APP_SECRET=
   FACEBOOK_REDIRECT_URI=https://your-domain.com/api/social/oauth/facebook/callback

   # Threads
   THREADS_APP_ID=
   THREADS_APP_SECRET=
   THREADS_REDIRECT_URI=https://your-domain.com/api/social/oauth/threads/callback

   # Token encryption (required, min 32 chars)
   SOCIAL_ENCRYPTION_KEY=
   ```

3. **Regenerate types** after Directus collections are created:
   ```bash
   pnpm generate:types
   ```

4. **Connect accounts** — navigate to `/social/settings` and click Connect for any platform.

### Platform Requirements

- **Instagram**: Requires a Facebook Developer app with Instagram Graph API, and an Instagram Business/Creator account linked to a Facebook Page.
- **TikTok**: Requires a TikTok Developer app with Login Kit and Content Posting API. Direct posting requires TikTok audit approval; otherwise posts go to inbox as drafts.
- **LinkedIn**: Requires a LinkedIn Developer app with Community Management API access. Scopes: `openid`, `profile`, `w_member_social`, `r_organization_social`, `w_organization_social`. Connects personal profiles and managed Company Pages. 60-day tokens with refresh support.
- **Facebook Pages**: Requires a Meta Developer app with Pages API access. Scopes: `pages_manage_posts`, `pages_read_engagement`, `pages_manage_engagement`. Only Facebook Pages you manage can be connected (personal profiles are not supported).
- **Threads**: Requires a Meta Developer app with Threads API access. Scopes: `threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_manage_replies`. Uses container-based publishing similar to Instagram. 60-day long-lived tokens.

## Theme System

The platform uses a semantic theme system via `t-*` CSS utility classes defined in `assets/css/theme.css`. These classes automatically adapt to light and dark mode using the existing shadcn-vue CSS variables.

| Class | Purpose |
|---|---|
| `t-bg`, `t-bg-alt`, `t-bg-subtle`, `t-bg-elevated` | Background variants |
| `t-text`, `t-text-secondary`, `t-text-tertiary`, `t-text-muted` | Text hierarchy |
| `t-text-accent`, `t-text-inverse` | Accent and inverse text |
| `t-border`, `t-border-accent`, `t-border-divider` | Border variants |
| `t-btn` | Primary button styling |
| `t-heading`, `t-body` | Typography classes |

## Authentication & SSO

The platform supports email/password login and SSO (Sign in with Google, Sign in with Apple). All authentication flows go through **Directus** as the identity provider.

### Email/Password Login
- Standard login via `server/api/auth/login.post.ts`
- Registration via `server/api/auth/register.post.ts` (creates user + org + Stripe customer)
- Tokens stored server-side in secure HTTP-only session cookies (`nuxt-auth-utils`)
- Proactive token refresh 2 minutes before expiry, cross-tab sync via BroadcastChannel

### SSO (Google & Apple)
SSO is handled by Directus's built-in SSO support. The Nuxt app redirects to Directus, which handles the full OAuth exchange, then redirects back with tokens.

**Flow:** User clicks "Sign in with Google" → Directus OAuth → callback with tokens → session created

**Key files:**
- `components/Auth/LoginForm.vue` — SSO buttons with graceful fallback (hidden when not configured)
- `pages/auth/sso-callback.vue` — Captures tokens from Directus redirect
- `server/api/auth/sso-callback.post.ts` — Validates tokens, creates session

**Setup:** SSO requires environment variables on the **Directus server** (not the Nuxt app). See `docs/directus-sso-setup.md` for complete configuration including Apple Developer Portal setup.

**Graceful degradation:** If Directus SSO is not configured, the login page shows only the email/password form. The SSO buttons appear automatically once `DIRECTUS_URL` is set and the Directus server has SSO providers configured.

## Calendar Integrations

The scheduler module supports syncing meetings to Google Calendar and Outlook Calendar.

### Google Calendar
- OAuth flow: `server/api/calendar/google/auth-url.get.ts` → `callback.get.ts`
- Event creation: `server/api/calendar/google/create-event.post.ts`
- Disconnect: `server/api/calendar/google/disconnect.post.ts`
- Tokens stored in `scheduler_settings.google_refresh_token` (encrypted)
- Scopes: `calendar`, `calendar.events`

### Outlook Calendar
- OAuth flow: `server/api/calendar/outlook/auth-url.get.ts` → `callback.get.ts`
- Event creation: `server/api/calendar/outlook/create-event.post.ts`
- Disconnect: `server/api/calendar/outlook/disconnect.post.ts`
- Tokens stored in `scheduler_settings.outlook_refresh_token` (encrypted)
- Scopes: `openid`, `profile`, `offline_access`, `Calendars.ReadWrite`

### Timezone Handling
Calendar events use a timezone fallback chain: request body `timezone` → user's `scheduler_settings.timezone` → `America/New_York` default. Users set their timezone in scheduler settings (`pages/scheduler/settings.vue`).

### Apple Calendar
Not implemented. Apple Calendar uses CalDAV (not a REST API), which requires significantly more infrastructure. Documented as a future consideration.

### Daily.co Video (replacing Twilio Video)
Video meetings use Daily.co for room creation and participant tokens. See `server/api/video/` for the API routes and `server/utils/daily.ts` for the client utility. Requires `DAILY_API_KEY` in `.env`.

**Note on Daily.co webhooks:** Daily.co configures webhooks via API, not through their dashboard. The webhook endpoint is registered programmatically when creating rooms — see `server/utils/daily.ts` for the `configureWebhook()` function.

## Deployment

The app is configured for deployment on **Vercel**. Make sure all required environment variables are set in your Vercel project settings, especially `NUXT_SESSION_PASSWORD`.

Build command: `pnpm build`
Output directory: `.output`

## Roadmap

### Planned

- **"Me" lens + Calendly-style booking pipeline** — Unified goal schema across user/team/client/org scope, re-stacked Command Center (You / Us / Reference), Calendly-equivalent event types + intake + auto-logged activity, paid bookings + embed, CRM Intelligence dashboard, and a unified client-scoped Inbox
- **SendGrid Email Activity Tracking** — Webhook endpoint to receive SendGrid events (opens, clicks, bounces, spam reports); `email_activity` collection for per-recipient event history; automatic bounce handling and contact status updates
- **Apple Calendar (CalDAV)** — Future: requires CalDAV client implementation, not a REST API

### Recently Shipped

- **~~Apps Layout~~** — ✅ Phases 0–7 shipped 2026-05-09 — new app-rail navigation as default, slide-overs on Work projects + meetings + Marketing campaigns, Activity feed under `/apps/clients/[id]?tab=activity`, retirement of the Hats role-preset picker
- **~~Client Portal~~** — ✅ Phases 1–2 shipped 2026-05-05; multi-root + inherited-access UX and per-category notifications wired up 2026-05-13. 10 client-scoped pages under `/portal/*`, bidirectional comments + reactions, mobile "More" sheet nav, dedicated `client_portal_users` collection
- **~~Branded Email Shell~~** — ✅ Stages 1–3 shipped 2026-05-13. Transactional + marketing senders on a single `renderOrgEmail()`, CAN-SPAM footer on marketing, `/api/email/preview` for 10 templates, live preview iframe on `/organization`
- **~~Stripe Connect Standard~~** — ✅ Shipped 2026-05-08. Per-org Connect onboarding, invoice payouts route to the seller's Stripe, "Manage on Stripe" deep-link, platform fallthrough for un-onboarded orgs
- **~~Invoicing Overhaul~~** — ✅ Shipped 2026-05-07. Manual payment tracking, rich-text line items, time-block grouping from the timer
- **~~Plaid Bank Sync~~** — ✅ Code complete 2026-05-07 (Phases 1+2); awaiting live Stripe Product wiring + Plaid prod env
- **~~Video Auto-Record + Annotation + Figma Sync~~** — ✅ Shipped 2026-05-06 across three sessions. Host auto-starts recording + transcription, `MeetingAnnotationCanvas` overlay, Figma frame embed with presenter handoff, `meeting_notes` capture + AI promote-to-tasks
- **~~AI Mutations (Tool Use)~~** — ✅ Shipped 2026-05-05. `update_field`, `reschedule_project`, `add_task` tool calls from the contextual sidebar
- **~~Document Themes + Branded Contracts/Proposals~~** — ✅ Shipped 2026-05-05. 3 themes on `.doc-shell`, org-level `document_theme` + `document_accent`, generic `DocumentPdfGenerator`
- **~~Subscription Plan Gating~~** — ✅ `planAllows()`, `hasAddon()`, server-side token/scan enforcement, add-on billing
- **~~SSO (Google & Apple Sign-In)~~** — ✅ Directus-based SSO with graceful fallback; see `docs/directus-sso-setup.md`
- **~~Daily.co Video~~** — ✅ Replaced Twilio Video with Daily.co; `server/utils/daily.ts`
- **~~Domain Migration~~** — ✅ Migrated to `earnest.guru`; app at `app.earnest.guru`, admin at `admin.earnest.guru`, marketing at `earnest.guru` (separate repo)
- **~~Demo Mode~~** — ✅ Two-tier demo at `/try-demo` (Solo + Agency seeded orgs) with a Member login for Solo and a 5-user Agency org; 10K AI tokens/mo budget

## Stripe Subscription Setup

The platform includes full Stripe subscription management. New users get a Stripe customer created during registration. The subscription page (`/account/subscription`) shows real-time plan status, payment methods, and billing history — all pulled from Stripe.

### Required Directus User Fields

Add these fields to the `directus_users` collection:

| Field | Type | Notes |
|---|---|---|
| `stripe_customer_id` | String | Stripe customer ID (cus_xxx) |
| `stripe_subscription_id` | String | Active subscription ID (sub_xxx) |
| `subscription_status` | String | active, trialing, past_due, canceled, etc. |

### Environment Variables

Add to `.env`:

```env
# Stripe keys
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_SECRET_KEY_TEST=sk_test_xxx
STRIPE_PUBLIC_KEY=pk_live_xxx
STRIPE_PUBLIC_KEY_TEST=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Subscription Price IDs (monthly + annual)
STRIPE_PRICE_SOLO=price_xxx
STRIPE_PRICE_SOLO_ANNUAL=price_xxx
STRIPE_PRICE_STUDIO=price_xxx
STRIPE_PRICE_STUDIO_ANNUAL=price_xxx
STRIPE_PRICE_AGENCY=price_xxx
STRIPE_PRICE_AGENCY_ANNUAL=price_xxx

# Token & Scan Credit Packages
STRIPE_PRICE_TOKENS_100K=price_xxx
STRIPE_PRICE_TOKENS_500K=price_xxx
STRIPE_PRICE_TOKENS_1_5M=price_xxx
STRIPE_PRICE_SCANS_100=price_xxx
STRIPE_PRICE_SCANS_500=price_xxx

# Add-On Price IDs
STRIPE_PRICE_ADDON_SEATS_5=price_xxx
STRIPE_PRICE_ADDON_COMMS=price_xxx
STRIPE_PRICE_ADDON_CLIENT_STARTER=price_xxx
STRIPE_PRICE_ADDON_CLIENT_PRO=price_xxx
STRIPE_PRICE_ADDON_CLIENT_UNLIMITED=price_xxx
STRIPE_PRICE_ADDON_WHITE_LABEL=price_xxx
```

### Stripe Dashboard Setup

1. **Create Products** — In Stripe Dashboard > Products, create three base plans: "Solo" ($49/mo, $408/yr), "Studio" ($149/mo, $1,241/yr), and "Agency" ($299/mo, $2,491/yr). Create each with monthly and annual recurring prices. Then create products for each add-on, token package, and scan pack. Copy all price IDs to your `.env`.

2. **Configure Customer Portal** — Go to Settings > Billing > Customer Portal and enable it. This lets users self-manage payment methods, view invoices, and cancel subscriptions.

3. **Register Webhook** — In Developers > Webhooks, add an endpoint pointing to `https://yourdomain.com/api/stripe/paymentchange` with these events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `checkout.session.completed`

### Key Files

| File | Purpose |
|---|---|
| `server/utils/stripe.ts` | Stripe client, `EARNEST_PLANS`, `EARNEST_ADDONS`, `TOKEN_PACKAGES`, `SCAN_PACKAGES`, plan/addon resolvers |
| `server/api/stripe/paymentchange.ts` | Webhook: syncs plan + token/scan limits + active add-ons to org |
| `server/api/stripe/subscription/checkout.post.ts` | Creates Stripe Checkout Session for new subscriptions |
| `server/api/stripe/subscription/status.get.ts` | Returns subscription status, payment methods, invoices |
| `server/api/stripe/subscription/cancel.post.ts` | Cancels subscription (end of period or immediate) |
| `server/api/stripe/subscription/resume.post.ts` | Resumes a canceling subscription |
| `server/api/stripe/subscription/portal.post.ts` | Opens Stripe Customer Portal for self-service |
| `server/api/stripe/addons/subscribe.post.ts` | Adds a recurring add-on to the org's subscription |
| `server/api/stripe/addons/cancel.post.ts` | Removes an add-on from the org's subscription |
| `server/utils/ai-token-enforcement.ts` | Server-side token + scan credit enforcement (pre-call gate, post-call deduct) |
| `server/utils/ai-usage.ts` | AI usage logging to `ai_usage_logs` |
| `server/utils/earnestScore.ts` | Earnest Score engine: `awardEP()`, level calc, streak tracking |
| `server/utils/daily.ts` | Daily.co REST API client for video meetings |
| `server/utils/twilioMaster.ts` | Twilio master account: sub-account provisioning, phone number purchase |
| `composables/useSubscription.ts` | Client-side subscription state composable |
| `composables/useOrgRole.ts` | Role checks + `planAllows()` + `hasAddon()` |
| `components/Organization/TokenMeter.vue` | Live token usage bar (compact for sidebar, full for billing page) |

### Stripe Connect Standard (Invoice Payouts)

Earnest orgs can connect their own Stripe account so invoice payments route **directly to the seller** — Earnest takes no fee, and money never touches the platform balance.

- **Onboarding** — From `/organization`, an "Connect Stripe" CTA opens a Stripe-hosted onboarding flow (`account_link.create` with the org's `stripe_account_id`). Refresh + return URLs round-trip back into the app.
- **Manage on Stripe** — Once connected, the same card swaps to a "Manage on Stripe" deep-link.
- **Webhook routing** — `paymentchange.ts` reads `event.account` so Connect events update the right org. Receipt URLs come from `charge.retrieve` (not the payment_intent alone).
- **Fallthrough** — Orgs that have not connected fall back to the platform Stripe account (this is how Earnest's own SaaS subscriptions and the "Earnest by Hue" invoices both work on a single Stripe account).

## Plaid Bank Sync (Add-On)

The `$9/mo` Bank Sync add-on connects an org's bank and credit-card accounts via Plaid so transactions auto-import for expense reconciliation. Gated server-side by `hasAddon('bank_sync')` after a Stripe entitlement check.

| File | Purpose |
|---|---|
| `server/api/plaid/link-token.post.ts` | Mint a Plaid Link token for the connect modal |
| `server/api/plaid/exchange-token.post.ts` | Exchange the public token, store the access token encrypted on the org |
| `server/api/plaid/refresh.post.ts` | Manual refresh (the `transactions` product is $0.30/acct/mo, refresh $0.12 each — see ops notes) |
| `composables/usePlaid.ts` | Client-side connect, list, refresh |
