# Hue Studios

A full-featured agency and business management platform built with [Nuxt 3](https://nuxt.com) and [Directus](https://directus.io).

## Features

- **Dashboard** — Activity overview with ticket analytics
- **Ticket Management** — Kanban board for task tracking
- **Project Management** — Projects with sub-tasks, events, and timelines
- **Invoices & Payments** — Stripe-powered billing, invoice PDF generation, payment tracking
- **Scheduling** — Calendar with public booking links and Twilio video meetings
- **Team Communication** — Channels and comment threads on tasks
- **Social Media** — Instagram and TikTok content calendar, post scheduling, analytics
- **Organization & Teams** — Multi-team support with role-based access control

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Nuxt 3, Vue 3, TypeScript |
| UI | shadcn-vue, Tailwind CSS v4, Reka UI |
| CMS / Backend | Directus (headless) |
| Auth | nuxt-auth-utils + Directus Auth |
| Payments | Stripe |
| Email | SendGrid |
| Video / SMS | Twilio |
| Calendar | Google Calendar API, Microsoft Outlook (Azure) |
| Social | Instagram Graph API, TikTok API |
| Storage | AWS S3 |
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
├── components/         # Vue components (including shadcn-vue ui/)
├── composables/        # Vue composables (auth, data fetching, etc.)
├── server/
│   ├── api/            # API routes (auth, directus, stripe, email, etc.)
│   ├── adapters/       # Social media platform adapters
│   ├── plugins/        # Nitro plugins (session hooks)
│   └── utils/          # Server utilities (Directus client, session mgmt)
├── middleware/          # Route middleware (auth, guest)
├── plugins/            # Client-side plugins
├── layouts/            # Page layouts
├── types/              # TypeScript type definitions
├── assets/css/         # Tailwind CSS styles
├── public/             # Static assets
└── scripts/            # Setup and utility scripts
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

### Social Pages

| Page | Path | Description |
|---|---|---|
| Dashboard | `/social/dashboard` | Overview stats, upcoming posts, quick actions |
| Compose | `/social/compose` | Create and schedule posts across platforms |
| Calendar | `/social/calendar` | Monthly calendar view of scheduled content |
| Analytics | `/social/analytics` | Follower growth, engagement, post performance |
| Clients | `/social/clients` | Manage agency clients, assign accounts |
| Settings | `/social/settings` | Connect/disconnect social accounts |
| Setup Guide | `/social/setup` | In-app configuration instructions |

### Platform Requirements

- **Instagram**: Requires a Facebook Developer app with Instagram Graph API, and an Instagram Business/Creator account linked to a Facebook Page.
- **TikTok**: Requires a TikTok Developer app with Login Kit and Content Posting API. Direct posting requires TikTok audit approval; otherwise posts go to inbox as drafts.

## Deployment

The app is configured for deployment on **Vercel**. Make sure all required environment variables are set in your Vercel project settings, especially `NUXT_SESSION_PASSWORD`.

Build command: `pnpm build`
Output directory: `.output`
