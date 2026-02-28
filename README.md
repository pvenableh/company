# Hue Studios

An all-in-one, agency-grade business management platform built with [Nuxt 3](https://nuxt.com), [Vue 3](https://vuejs.org), and [Directus](https://directus.io). Designed for creative agencies, consultancies, and growing SMBs that need project delivery, client management, financials, team collaboration, and social media management under one roof.

## Features

### Core Modules

- **Dashboard** — Personalized activity overview with ticket analytics and quick-access links
- **Ticket Management** — Kanban board with drag-and-drop, custom statuses, service tagging, organization filtering, assignment modal, and detailed activity logs
- **Project Management** — Visual Gantt-style timeline with milestones, Kanban board view, sub-tasks, event scheduling, file attachments, threaded conversations, and emoji reactions
- **Invoicing & Payments** — Stripe-powered billing, invoice creation and editing, PDF generation (html2canvas + jsPDF), payment tracking, payout management, and public payment links
- **Scheduling & Video Meetings** — Calendar with public booking links, availability management, Google Calendar and Outlook sync, and built-in Twilio video conferencing
- **Team Communication** — Slack-style channels per organization with threaded comments, @mentions, emoji reactions, and WebSocket-powered real-time messaging
- **Social Media Management** — Compose, schedule, and publish to Instagram and TikTok; content calendar, engagement analytics, multi-client management, and OAuth account connections
- **Organizations & Teams** — Multi-organization support with team structures, role-based access control (admin, client manager, user), member invitations, and cross-tab state sync

### Supporting Features

- **Task Management** — Personal task lists tied to projects and organizations
- **Real-Time Collaboration** — WebSocket multiplexing for live updates, user presence indicators, and instant notifications
- **Email Notifications** — Transactional emails via SendGrid for invoices, appointments, password resets, and team invitations
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
| Email | SendGrid |
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
│   ├── Scheduler/      # Calendar, booking, video meetings
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
│   ├── api/            # API routes (auth, directus, stripe, email, social, etc.)
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
| Social Dashboard | `/social/dashboard` | Social media overview and scheduling |
| Social Compose | `/social/compose` | Create and schedule posts |
| Social Calendar | `/social/calendar` | Visual content calendar |
| Social Analytics | `/social/analytics` | Engagement and growth metrics |
| Social Clients | `/social/clients` | Agency client management |
| Organizations | `/organization` | Organization and member management |
| Teams | `/organization/teams` | Team structure and roles |
| Account | `/account` | User profile and settings |
| Public Booking | `/book/[userId]` | Client-facing scheduling page |

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
