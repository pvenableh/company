# Earnest

A multi-tenant SaaS business management platform built with [Nuxt 3](https://nuxt.com), [Vue 3](https://vuejs.org), and [Directus](https://directus.io). Designed for creative agencies, consultancies, and growing SMBs that need project delivery, client management, financials, team collaboration, social media management, email marketing, and AI-powered productivity intelligence under one roof. Organizations serve as the tenant boundary, with per-org roles, customizable permissions, and subscription plan gating.

## Features

### Core Modules

- **Dashboard** — Personalized activity overview with ticket analytics and quick-access links
- **Ticket Management** — Kanban board with drag-and-drop, custom statuses, service tagging, organization filtering, assignment modal, and detailed activity logs
- **Project Management** — Visual Gantt-style timeline with milestones, Kanban board view, sub-tasks, event scheduling, file attachments, threaded conversations, and emoji reactions
- **Invoicing & Payments** — Stripe-powered billing, invoice creation and editing, PDF generation (html2canvas + jsPDF), payment tracking, payout management, and public payment links
- **Scheduling & Video Meetings** — Calendar with public booking links, availability management, Google Calendar and Outlook sync, and built-in Twilio video conferencing
- **Team Communication** — Slack-style channels per organization with threaded comments, @mentions, emoji reactions, and WebSocket-powered real-time messaging
- **Social Media Management** — Compose, schedule, and publish to Instagram and TikTok; content calendar, engagement analytics, multi-client management, and OAuth account connections
- **Email Marketing & Newsletters** — Block-based MJML newsletter builder with 17+ reusable blocks, drag-and-drop assembly, live preview, mailing list management with deduplication, CSV contact import, merge-tag personalization via Handlebars, editable header/footer partials, one-click unsubscribe, "View in Browser" web links, and campaign send tracking via SendGrid
- **Client Management** — Track the companies your organization serves with status workflows (active, prospect, inactive, churned), industry tagging, primary contact assignment, and linked contacts/projects/tickets/invoices per client
- **Contact CRM** — Contact management with tagging, custom fields, mailing list membership, subscription tracking, client association, and CSV import/export
- **AI Command Center** — AI-powered productivity engine that analyzes tickets, projects, tasks, invoices, contacts, deals, channels, social media, scheduling, and phone activity to generate prioritized action items, reminders, insights, and follow-ups; includes productivity scoring (0-100), customizable AI module preferences, team chat, and financial analysis; supports Claude (Anthropic), GPT (OpenAI), and Gemini (Google) backends
- **Organizations & Multi-Tenancy** — Multi-organization support with per-org roles (Owner, Admin, Manager, Member, Client), customizable permission matrices per role, team structures, member invitations, subscription plan tiers, and cross-tab state sync

### Supporting Features

- **Task Management** — Personal task lists tied to projects and organizations
- **Real-Time Collaboration** — WebSocket multiplexing for live updates, user presence indicators, and instant notifications
- **Email Notifications** — Transactional emails via SendGrid for invoices, appointments, password resets, and team invitations
- **Email Templates** — MJML-powered responsive email templates with block-based composition, design-time variables (`{{{triple braces}}}`), and runtime personalization (`{{double braces}}`)
- **File Storage** — AWS S3 integration with presigned URLs for secure uploads
- **Dark Mode** — System-aware dark/light theme with manual toggle
- **PWA** — Install as a native-feeling progressive web app on any device
- **Theme System** — Semantic `t-*` CSS utility classes that adapt to light and dark mode
- **Marketing Sell Sheet** — Design-forward landing page shown to unauthenticated visitors at `/`

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Nuxt 3, Vue 3, TypeScript |
| UI | shadcn-vue, Tailwind CSS v4, Reka UI |
| Icons | @nuxt/icon (Heroicons, Lucide, Material Symbols) |
| CMS / Backend | Directus (headless) |
| Auth | nuxt-auth-utils + Directus Auth |
| Payments | Stripe |
| AI | Anthropic Claude, OpenAI GPT, Google Gemini |
| Email | SendGrid, MJML, Handlebars |
| Video / SMS | Twilio |
| Calendar | Google Calendar API, Microsoft Outlook (Azure) |
| Social | Instagram Graph API, TikTok API |
| Storage | AWS S3 |
| Charts | Chart.js, Unovis |
| Animations | GSAP, VueUse Motion |
| Forms | VeeValidate, Yup, Zod |
| Rich Text | TipTap |
| Tables | TanStack Vue Table |
| Analytics | Google Analytics (nuxt-gtag) |
| Package Manager | pnpm |

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
| `DIRECTUS_STATIC_TOKEN` | Directus static token for server-side admin operations |

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

```
├── pages/              # Route pages (Nuxt file-based routing)
├── components/
│   ├── Pages/          # Full-page components (SellSheet, etc.)
│   ├── Tickets/        # Kanban board, dashboard, cards
│   ├── Projects/       # Timeline, board, overview
│   ├── Invoices/       # Invoice forms, PDF generation
│   ├── Channels/       # Real-time messaging
│   ├── Clients/        # Client forms, cards
│   ├── Scheduler/      # Calendar, booking, video meetings
│   ├── CommandCenter/  # AI tray, suggestion cards, productivity meter, preferences
│   ├── Newsletter/     # Block builder, canvas, variable editor, partials
│   ├── Contacts/       # Contact forms, tables, merge tag reference
│   ├── Import/         # CSV column mapper
│   ├── Social/         # Social media date pickers
│   ├── ProjectTimeline/# Canvas-based timeline visualization
│   ├── Comments/       # Threaded comment system
│   ├── Reactions/      # Emoji reactions
│   ├── Layout/         # Header, footer, navigation, notifications
│   ├── Auth/           # Login, register, password reset forms
│   ├── Form/           # Reusable form components (TipTap, uploads)
│   ├── Payment/        # Stripe card and payment UI
│   ├── Teams/          # Team management cards and modals
│   └── ui/             # shadcn-vue base components
├── composables/        # Vue composables (auth, data fetching, real-time, etc.)
├── server/
│   ├── api/            # API routes (auth, directus, stripe, email, social, org, etc.)
│   ├── adapters/       # Social media platform adapters (Instagram, TikTok)
│   ├── plugins/        # Nitro plugins (session hooks)
│   └── utils/          # Server utilities (Directus client, crypto, logging)
├── middleware/          # Route middleware (auth, guest)
├── plugins/            # Client-side plugins
├── layouts/            # Page layouts (default, auth, blank, email)
├── types/              # TypeScript type definitions
├── assets/css/         # Tailwind CSS, theme system, fonts, variables
├── public/             # Static assets
└── scripts/            # Setup and utility scripts
```

## Key Pages

| Page | Route | Description |
|---|---|---|
| Home | `/` | Sell sheet (unauthenticated) or dashboard (authenticated) |
| Tickets | `/tickets` | Kanban board for task management |
| Projects | `/projects` | Timeline and board views for project management |
| Invoices | `/invoices` | Invoice list, creation, and payment tracking |
| Scheduler | `/scheduler` | Calendar, booking, and video meeting management |
| Channels | `/channels` | Real-time team messaging |
| Command Center | `/command-center` | AI productivity dashboard and task analyzer |
| Command Center Chat | `/command-center/chat` | AI-powered team chat |
| Financials | `/command-center/financials` | Financial analysis and quarterly goals |
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
| Clients | `/clients` | Client list with status filters and search |
| Client Detail | `/clients/[id]` | Client overview with linked contacts, projects, and tickets |
| Organizations | `/organization` | Organization and member management |
| Teams | `/organization/teams` | Team structure and roles |
| Account | `/account` | User profile and settings |
| Public Booking | `/book/[userId]` | Client-facing scheduling page |

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

### Subscription Plan Gating

Organizations have a `plan` field (free, starter, pro, enterprise) that hooks into the permission system. The `planAllows(feature)` function in `useOrgRole()` is a placeholder that currently returns `true` for all features. When subscription tiers are implemented, it becomes a two-layer check: role permissions AND plan availability.

### Directus Collections

| Collection | Purpose |
|---|---|
| `organizations` | Tenant boundary with plan tier |
| `clients` | Companies an organization serves (active, prospect, inactive, churned) |
| `org_roles` | Per-org role definitions with permission matrices |
| `org_memberships` | User-to-org membership with role, status, client scope, and invitation tracking |
| `organizations_directus_users` | Legacy junction (kept for backward compatibility) |

### Key Composables

| Composable | Purpose |
|---|---|
| `useOrganization()` | Org context: selected org, org list with membership data, org-scoped filters |
| `useOrgRole()` | Per-org role: role booleans, permission checks, client scope, plan gating |
| `useRole()` | Legacy global role checks (bridge to `useOrgRole` in progress) |
| `useClients()` | Client CRUD with org-scoping, search, status filters |

### Server Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/org/seed-roles` | Creates 5 system roles for an organization (idempotent) |
| `POST /api/org/migrate-memberships` | Converts legacy junction entries to `org_memberships` |

### Migration Path

The system is designed for backward compatibility. The legacy `organizations_directus_users` junction and `useRole.ts` continue working alongside the new system. The migration endpoint converts existing user-org relationships into `org_memberships` with appropriate role mappings (Directus admin role to org admin, client manager to org manager, others to member).

## AI Command Center

The platform includes an AI-powered command center that acts as a productivity co-pilot. It analyzes data across every module and generates a prioritized, actionable task list — so your team always knows what to focus on next.

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

### Directus Collections

| Collection | Purpose |
|---|---|
| `ai_preferences` | Per-user AI module toggle preferences |
| `ai_chat_sessions` | AI assistant chat session history with context |
| `ai_chat_messages` | Individual messages (user/assistant/system roles) |
| `financial_goals` | Quarterly revenue goals per organization |

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
| `contacts` | Contact CRM with subscription and custom fields |
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

The platform includes a full social media management system for Instagram and TikTok. See the in-app setup guide at `/social/setup` for detailed configuration steps.

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

   # Token encryption (required, min 32 chars)
   SOCIAL_ENCRYPTION_KEY=
   ```

3. **Regenerate types** after Directus collections are created:
   ```bash
   pnpm generate:types
   ```

4. **Connect accounts** — navigate to `/social/settings` and click Connect for Instagram or TikTok.

### Platform Requirements

- **Instagram**: Requires a Facebook Developer app with Instagram Graph API, and an Instagram Business/Creator account linked to a Facebook Page.
- **TikTok**: Requires a TikTok Developer app with Login Kit and Content Posting API. Direct posting requires TikTok audit approval; otherwise posts go to inbox as drafts.

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

## Deployment

The app is configured for deployment on **Vercel**. Make sure all required environment variables are set in your Vercel project settings, especially `NUXT_SESSION_PASSWORD`.

Build command: `pnpm build`
Output directory: `.output`

## Roadmap

The following features are planned for upcoming development phases:

### In Progress

- **Replace Role Checks** (Phase 3) — Refactor all `isAdmin()` / `hasAdminAccess()` checks to use `useOrgRole()` permission system; add `<PermissionGate>` renderless component; build admin page for editing org role permissions
- **Registration & Invitation Flows** (Phase 4) — Sign-up creates user + org + default roles + owner membership; member invitation system with role selection; client invitation scoped to client records; welcome/invite email templates via MJML

### Planned

- **Org-Scope Data Isolation** (Phase 5) — Ensure contacts, mailing lists, and email templates are org-scoped in all queries; add client filter support to contacts
- **Client Portal** (Phase 6) — Simplified layout for client-role users with scoped access to their projects, tickets, and messages; middleware to redirect client users away from admin routes
- **SendGrid Email Activity Tracking** — Webhook endpoint to receive SendGrid events (opens, clicks, bounces, spam reports); `email_activity` collection for per-recipient event history; automatic bounce handling and contact status updates
- **Chat Widget** — Frontend UI for the existing `ai_chat_sessions` / `ai_chat_messages` Directus collections; `useAIChat` composable; streaming AI responses; persistent conversation history
- **Notification Email Pipeline** — Unified transactional email handler for form submissions, sign-ups, ticket updates, and appointment confirmations using the existing MJML compiler + Handlebars system
- **Subscription Plan Billing** — Stripe subscription integration; `subscription_plans` collection with feature caps and usage limits; plan-gated feature availability via `planAllows()`
