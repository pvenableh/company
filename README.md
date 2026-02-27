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

## Deployment

The app is configured for deployment on **Vercel**. Make sure all required environment variables are set in your Vercel project settings, especially `NUXT_SESSION_PASSWORD`.

Build command: `pnpm build`
Output directory: `.output`
