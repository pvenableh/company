#!/usr/bin/env tsx
/**
 * capture-demo-screenshots.ts
 *
 * Drives a headless Chromium through the public demo workspace and
 * screenshots the screens referenced by the marketing site. Writes PNGs into
 * `<earnest-marketing>/public/screenshots/<YYYY-MM>/<slug>.png` (dated
 * history) AND `<earnest-marketing>/public/screenshots/latest/<slug>.png`
 * (what the feature pages actually read from).
 *
 * Usage:
 *   DEMO_USER_PASSWORD=… \
 *   DEMO_AGENCY_USER_PASSWORD=… \
 *   APP_URL=http://localhost:3000 \
 *   pnpm tsx scripts/capture-demo-screenshots.ts
 *
 * `DEMO_AGENCY_USER_PASSWORD` is optional — when absent, Admin-role shots
 * (`/organization/*`, `/teams/*`, full `/marketing`) are skipped and the
 * script still captures the Member-role set. This lets the script run in
 * environments that only have the solo demo provisioned.
 *
 * See scripts/CAPTURE-SCREENSHOTS.md for the full checklist.
 */
import 'dotenv/config';
import { mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ─────────────────────────────────────────────────────────────

const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD;
const DEMO_AGENCY_USER_PASSWORD = process.env.DEMO_AGENCY_USER_PASSWORD;

if (!DEMO_USER_PASSWORD) {
	console.error('✗ DEMO_USER_PASSWORD is required (see .env / Vercel).');
	process.exit(1);
}

const AGENCY_AVAILABLE = Boolean(DEMO_AGENCY_USER_PASSWORD);
if (!AGENCY_AVAILABLE) {
	console.warn('⚠ DEMO_AGENCY_USER_PASSWORD not set — skipping Admin-role captures.');
}

/** Earnest-marketing repo lives as a sibling of the earnest app repo. */
const MARKETING_REPO = resolve(__dirname, '../../earnest-marketing');
if (!existsSync(MARKETING_REPO)) {
	console.error(`✗ Marketing repo not found at ${MARKETING_REPO}`);
	console.error('  Expected sibling directory. Adjust MARKETING_REPO if your layout differs.');
	process.exit(1);
}

/** YYYY-MM slug for the dated archive month, plus a per-run timestamp
 *  subfolder so re-runs within the same month don't clobber each other. */
const now = new Date();
const MONTH_SLUG = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const RUN_SLUG = now.toISOString().replace(/\..+$/, '').replace(/:/g, '-'); // 2026-05-01T16-32-04

const DATED_DIR = resolve(MARKETING_REPO, 'public/screenshots', MONTH_SLUG, RUN_SLUG);
const LATEST_DIR = resolve(MARKETING_REPO, 'public/screenshots/latest');

// Debounce after `domcontentloaded` — gives sticky header/sidebar and any
// animations a beat to settle before the shutter fires. 8s covers heavy
// dashboards (command-center gantt + priority actions) on cold contexts
// where Vite serves modules without warm cache.
const SETTLE_MS = 8000;

/** CSS we inject on every page to hide overlays that shouldn't appear in
 *  marketing shots (floating dock with the AI launcher, presence pills,
 *  the contextual AI sidebar if it happens to be open). */
const HIDE_OVERLAYS_CSS = `
.floating-dock,
[data-testid="ai-tray"],
.dock-morph,
.dock-edge-trigger,
#nuxt-devtools-anchor,
.nuxt-devtools-panel,
[data-v-inspector-icon],
.__nuxt-devtools__,
[data-nuxt-devtools] { display: none !important; }
`;

// ─── Capture plan ───────────────────────────────────────────────────────

type ViewportPreset = 'hero' | 'inline' | 'tall';

const VIEWPORTS: Record<ViewportPreset, { width: number; height: number; deviceScaleFactor: number }> = {
	// Hero shot is larger & higher density — used for above-the-fold art.
	hero: { width: 1440, height: 900, deviceScaleFactor: 2 },
	// Inline shots on feature pages — slightly smaller.
	inline: { width: 1280, height: 720, deviceScaleFactor: 2 },
	// Tall shots for pages whose content card runs past 720px (e.g. the
	// org Branding panel) so the whole card fits in frame instead of clipping.
	tall: { width: 1280, height: 1180, deviceScaleFactor: 2 },
};

type Persona = 'solo' | 'agency';

interface Shot {
	/** Filename (without extension) written to both dated/ and latest/. */
	slug: string;
	/** Which viewport preset to use. */
	viewport: ViewportPreset;
	/**
	 * Which demo workspace to sign into before capturing. `solo` is the
	 * Member-role workspace; `agency` is the Admin-role one and unlocks
	 * team/org/marketing screens that Member role hides.
	 */
	persona: Persona;
	/**
	 * Produces the path on app.earnest.guru to navigate to. Async because
	 * detail pages need to look up a real seeded ID first.
	 */
	resolveUrl: (ctx: CaptureContext) => Promise<string>;
	/** Optional extra waiting before screenshotting (e.g. a specific
	 *  element that indicates data finished loading). */
	waitFor?: (page: Page) => Promise<void>;
}

interface CaptureContext {
	page: Page;
	baseUrl: string;
}

const SHOTS: Shot[] = [
	// ── Solo (Member role) ──
	{
		slug: 'command-center',
		viewport: 'hero',
		persona: 'solo',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/command-center`,
		// Project Timeline lanes start collapsed in UnifiedGantt — for the
		// marketing shot we want one project expanded so events/tasks are
		// visible underneath. Synthetic .click() avoids the auto-scroll
		// Playwright's pointer-click triggers; scrollTo(0,0) puts the page
		// header back in frame after the row toggle reflows the grid.
		waitFor: async (page) => {
			const toggle = page.locator('.gantt__toggle').first();
			try {
				await toggle.waitFor({ state: 'visible', timeout: 5000 });
				await toggle.evaluate((el: HTMLElement) => el.click());
				await page.waitForTimeout(800);
				await page.evaluate(() => window.scrollTo(0, 0));
				await page.waitForTimeout(300);
			} catch {
				/* gantt didn't render — fall through, capture as-is */
			}
		},
	},
	{
		slug: 'leads-pipeline',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell Leads floor (was classic /leads) — keeps the marketing
		// site on the unified /apps/* chrome.
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/clients?view=leads`,
	},
	{
		slug: 'contact-detail',
		viewport: 'inline',
		persona: 'solo',
		resolveUrl: async (ctx) => `${ctx.baseUrl}${await firstDetailHref(ctx.page, '/contacts', ctx.baseUrl)}`,
	},
	{
		slug: 'client-detail',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell client workspace (was classic /clients/[id]).
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/apps/clients/${await firstItemId(ctx.page, 'clients', ctx.baseUrl)}`,
	},
	{
		slug: 'project-timeline',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell project workspace (was classic /projects/[id]).
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/apps/work/projects/${await firstItemId(ctx.page, 'projects', ctx.baseUrl)}`,
	},
	{
		slug: 'tickets-kanban',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell Tickets floor (was classic /tickets).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/work?floor=tickets`,
	},
	{
		slug: 'financials-overview',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell Money app, Cash flow floor (was classic /financials).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/money`,
	},
	{
		slug: 'people-dashboard',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell Clients app, Intelligence floor (was classic /contacts?view=insights).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/clients?view=intelligence`,
	},
	{
		slug: 'scheduler-day',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell Work app, Calendar floor (was classic /scheduler).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/work?floor=calendar`,
	},
	{
		slug: 'quick-tasks',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell Work app, Tasks floor (was classic /tasks).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/work?floor=tasks`,
	},
	{
		slug: 'time-tracker',
		viewport: 'inline',
		persona: 'solo',
		// Legacy `/time-tracker` route was removed in the Retainer plan
		// (Phase 2) — the canonical home is the Time floor on /apps/work.
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/work?floor=time`,
		// Realtime subscription on time_entries can lag the initial render
		// of the "This Week" tab — give it a beat before the shutter fires.
		waitFor: async (page) => {
			await page.waitForTimeout(1500);
		},
	},
	{
		slug: 'proposals-composer',
		viewport: 'inline',
		persona: 'solo',
		// Composer is the proposal detail page. Pick the newest proposal so
		// the seeded "Atlas Fintech" doc with composed blocks wins over any
		// older empty proposal that may exist in the demo org.
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/proposals/${await firstItemId(ctx.page, 'proposals', ctx.baseUrl, undefined, ['-date_created'])}`,
	},
	{
		slug: 'proposals-preview',
		viewport: 'inline',
		persona: 'solo',
		// Preview is /proposals/preview/<id> — branded client-facing view.
		// Same newest-first ordering as the composer shot.
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/proposals/preview/${await firstItemId(ctx.page, 'proposals', ctx.baseUrl, undefined, ['-date_created'])}`,
		// Preview uses a spinner (animate-spin), not a skeleton (animate-pulse),
		// so the global wait predicate doesn't catch it. Wait for the
		// document body to render before shooting.
		waitFor: async (page) => {
			await page
				.waitForSelector('.proposal, .document-preview, [class*="proposal"]', { timeout: 8000 })
				.catch(() => {
					/* fall through — capture whatever rendered */
				});
			await page.waitForTimeout(1000);
		},
	},
	{
		slug: 'contracts-list',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell Money app, Documents floor, Contracts sub-tab (the floor
		// stacks proposals + contracts and defaults to proposals; was classic
		// /contracts).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/money?floor=documents&tab=contracts`,
	},
	{
		slug: 'contracts-signed',
		viewport: 'inline',
		persona: 'solo',
		// Filter for the signed contract specifically — the seed always
		// creates one. If none exists, fall back to the first row.
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/contracts/${await firstItemId(ctx.page, 'contracts', ctx.baseUrl, { contract_status: { _eq: 'signed' } })}`,
	},
	{
		slug: 'ai-sidebar',
		viewport: 'inline',
		persona: 'solo',
		// Apps-shell client workspace + contextual AI panel (was classic /clients/[id]).
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/apps/clients/${await firstItemId(ctx.page, 'clients', ctx.baseUrl)}`,
		// Open the contextual AI panel after the page settles. The trigger
		// is an "Ask Earnest" button in the client header; the sidebar state
		// is module-level so the click flips it open.
		waitFor: async (page) => {
			const trigger = page.getByRole('button', { name: /ask earnest/i });
			try {
				await trigger.click({ timeout: 3000 });
				// Wait for the chat panel to mount + settle.
				await page.waitForTimeout(1500);
			} catch {
				/* if the button isn't present, fall through and capture without */
			}
		},
	},
	{
		slug: 'ai-actions',
		viewport: 'inline',
		persona: 'solo',
		// AI Actions is the same contextual sidebar surface as ai-sidebar, but
		// scoped to a project so the marketing copy ("Reschedule a project —
		// every linked event and task shifts automatically") matches the shot.
		// Apps-shell project workspace (was classic /projects/[id]).
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/apps/work/projects/${await firstItemId(ctx.page, 'projects', ctx.baseUrl)}`,
		waitFor: async (page) => {
			const trigger = page.getByRole('button', { name: /ask earnest/i });
			try {
				await trigger.click({ timeout: 3000 });
				await page.waitForTimeout(1500);
			} catch {
				/* fall through */
			}
		},
	},

	// ── Apps Layout — the new unified shell ──
	{
		slug: 'apps-rail',
		viewport: 'hero',
		persona: 'solo',
		// The /apps/work landing — primary visual proof of the AppRail
		// (palette-tinted plinth, circular gradient app chips) + the
		// pill-segmented floor strip + the Projects timeline. This is the
		// hero shot for the new shell.
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/work`,
		// Same gantt-expand routine as command-center so a row is open.
		waitFor: async (page) => {
			const toggle = page.locator('.gantt__toggle').first();
			try {
				await toggle.waitFor({ state: 'visible', timeout: 5000 });
				await toggle.evaluate((el: HTMLElement) => el.click());
				await page.waitForTimeout(800);
				await page.evaluate(() => window.scrollTo(0, 0));
				await page.waitForTimeout(300);
			} catch {
				/* fall through */
			}
		},
	},
	{
		slug: 'client-workspace',
		viewport: 'inline',
		persona: 'solo',
		// ClientWorkspace 8-tab parity surface at /apps/clients/[id]. The
		// existing `client-detail` shot points at the classic /clients/[id]
		// route — this is the Apps Layout variant.
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/apps/clients/${await firstItemId(ctx.page, 'clients', ctx.baseUrl)}`,
		// Activity tab spinner — wait for it to clear before shooting.
		waitFor: async (page) => {
			await page.waitForSelector('.animate-spin', { state: 'detached', timeout: 8000 }).catch(() => {});
			await page.waitForTimeout(1200);
		},
	},
	{
		slug: 'project-workspace',
		viewport: 'inline',
		persona: 'solo',
		// ProjectWorkspace 8-tab parity surface at /apps/work/projects/[id],
		// default Activity tab. Complements the classic `project-timeline`
		// shot (which still shows the Gantt at /projects/[id]).
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/apps/work/projects/${await firstItemId(ctx.page, 'projects', ctx.baseUrl)}`,
		// The Activity tab loads via a spinner (animate-spin), which the global
		// skeleton (animate-pulse) wait doesn't catch — let it clear first.
		waitFor: async (page) => {
			await page.waitForSelector('.animate-spin', { state: 'detached', timeout: 8000 }).catch(() => {});
			await page.waitForTimeout(1200);
		},
	},
	{
		slug: 'project-documents',
		viewport: 'inline',
		persona: 'solo',
		// Documents tab on ProjectWorkspace — stacks Proposals + Contracts
		// scoped to this project via the new project FK on each. `?tab=documents`
		// is honored by VALID_TABS in the page.
		resolveUrl: async (ctx) =>
			`${ctx.baseUrl}/apps/work/projects/${await firstItemId(ctx.page, 'projects', ctx.baseUrl)}?tab=documents`,
	},
	{
		slug: 'carddesk',
		viewport: 'inline',
		persona: 'solo',
		// CardDesk dashboard — the new business-card scanner / contact-sourcing
		// surface that promotes into the CRM. Shows the install-promo banner
		// when not yet installed as a PWA.
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/carddesk`,
	},

	// ── Agency (Admin role) — shots that Member role would render empty or 403 ──
	{
		slug: 'marketing-overview',
		viewport: 'inline',
		persona: 'agency',
		// Apps-shell Marketing app, Pulse floor (was classic /marketing).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/marketing`,
	},
	{
		slug: 'marketing-recommendations',
		viewport: 'inline',
		persona: 'agency',
		// Apps-shell Marketing app (Pulse floor), scrolled to the recommendation
		// feed (the MarketingFeedSection) so the campaign cards are in frame
		// instead of the KPI strip.
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/marketing`,
		waitFor: async (page) => {
			await page
				.evaluate(() => {
					const candidates = Array.from(document.querySelectorAll('h2, h3, [class*="MarketingFeed"]'));
					const el = candidates.find((n) => /recommend|feed|for you/i.test(n.textContent ?? ''));
					if (el) (el as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'start' });
				})
				.catch(() => {
					/* best effort */
				});
			await page.waitForTimeout(600);
		},
	},
	{
		slug: 'social-inbox',
		viewport: 'inline',
		persona: 'agency',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/social/inbox`,
	},
	{
		slug: 'social-analytics',
		viewport: 'inline',
		persona: 'agency',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/social/analytics`,
	},
	{
		slug: 'organization-overview',
		viewport: 'inline',
		persona: 'agency',
		// Apps-shell Organization app, Overview floor (was classic /organization).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/organization`,
	},
	{
		slug: 'organization-branding',
		viewport: 'tall',
		persona: 'agency',
		// Apps-shell Organization app, Settings floor — branding/whitelabel now
		// lives here as the Document theme + brand identity editor (was the
		// classic /organization#branding card). Scroll the theme/brand block
		// into frame.
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/organization?floor=settings`,
		waitFor: async (page) => {
			await page
				.evaluate(() => {
					const el = Array.from(document.querySelectorAll('h1, h2, h3')).find((h) =>
						/brand|theme|whitelabel|document/i.test(h.textContent ?? ''),
					);
					if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
				})
				.catch(() => {
					/* best effort */
				});
			await page.waitForTimeout(600);
		},
	},
	{
		slug: 'organization-teams',
		viewport: 'inline',
		persona: 'agency',
		// Apps-shell Organization app, Teams floor (was classic /organization/teams).
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/apps/organization?floor=teams`,
	},
	{
		slug: 'team-detail',
		viewport: 'inline',
		persona: 'agency',
		resolveUrl: async (ctx) => `${ctx.baseUrl}${await firstDetailHref(ctx.page, '/teams', ctx.baseUrl)}`,
	},
	{
		slug: 'documents-library',
		viewport: 'inline',
		persona: 'agency',
		// Documents Library is now a slide-over panel in the apps layout —
		// the /organization/documents-library route 301s into this URL.
		// Shows the panel-stack chrome over the org-settings floor.
		resolveUrl: async ({ baseUrl }) =>
			`${baseUrl}/apps/organization?floor=settings&slide=documents_library:offerings`,
		// The slide-over animates in (Framework7 spring, ~400ms) — wait for
		// it to fully render before shooting.
		waitFor: async (page) => {
			await page.waitForTimeout(900);
		},
	},
];

// ─── Helpers ────────────────────────────────────────────────────────────

async function firstDetailHref(page: Page, listPath: string, baseUrl: string): Promise<string> {
	const collection = listPath.replace(/^\//, '');
	const id = await firstItemId(page, collection, baseUrl);
	return `${listPath}/${id}`;
}

/**
 * Page-side fetch against `/api/directus/items` returning the first row's
 * `id` for the given collection. Optional `filter` narrows to a specific
 * subset (e.g. signed contracts). Used by `firstDetailHref` and any shot
 * that needs an id on a non-list URL (preview pages, etc).
 */
async function firstItemId(
	page: Page,
	collection: string,
	baseUrl: string,
	filter?: Record<string, any>,
	sort: string[] = [],
): Promise<string> {
	// Establish an origin for the page-side fetch so the relative URL works
	// and the auth cookie is in scope. Use `domcontentloaded` (not
	// `networkidle`) — the list pages keep notification long-polls open
	// indefinitely and `networkidle` never resolves on prod.
	if (page.url() === 'about:blank') {
		await page.goto(`${baseUrl}/command-center`, { waitUntil: 'domcontentloaded', timeout: 15000 });
	}

	const result = await page.evaluate(
		async ({ col, filt, srt }) => {
			try {
				const res = await fetch(`/api/directus/items`, {
					method: 'POST',
					credentials: 'include',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						collection: col,
						operation: 'list',
						query: {
							limit: 1,
							fields: ['id'],
							...(filt ? { filter: filt } : {}),
							...(srt && srt.length ? { sort: srt } : {}),
						},
					}),
				});
				if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 120)}` };
				const json = await res.json().catch(() => null);
				const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
				return { id: arr[0]?.id ?? null };
			} catch (err) {
				return { error: String(err) };
			}
		},
		{ col: collection, filt: filter ?? null, srt: sort },
	);

	if (typeof result === 'object' && result && 'id' in result && result.id) {
		return String(result.id);
	}
	if (typeof result === 'object' && result && 'error' in result) {
		console.warn(`  ⚠ ${collection} resolver: ${result.error}`);
	}
	// Fall back to the unfiltered first row if the filter matched nothing.
	if (filter) return firstItemId(page, collection, baseUrl);
	throw new Error(`No seeded ${collection} rows found. Re-run scripts/setup-demo-org.ts?`);
}

const LOGIN_ENDPOINT: Record<Persona, string> = {
	solo: '/api/auth/demo-login',
	agency: '/api/auth/demo-agency-login',
};

/**
 * Pin the persona's organization as the selected one. A fresh browser context
 * has no `selectedOrganization` cookie/localStorage, so the app falls back to
 * the "ALL" scope — which renders org-scoped pages (/organization branding,
 * /tickets) empty ("No Organization Selected"). Each demo user belongs to one
 * org, so we fetch its id and pin it via both the cookie and localStorage the
 * app reads. Best-effort: on any failure we leave the default scope.
 */
async function pinSelectedOrg(context: BrowserContext, persona: Persona): Promise<void> {
	try {
		const res = await context.request.post(`${APP_URL}/api/directus/items`, {
			headers: { 'content-type': 'application/json' },
			data: { collection: 'organizations', operation: 'list', query: { limit: 1, fields: ['id'] } },
		});
		if (!res.ok()) return;
		const json = (await res.json().catch(() => null)) as any;
		const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
		const orgId = arr[0]?.id;
		if (!orgId) return;
		await context.addCookies([
			{ name: 'selectedOrganization', value: String(orgId), url: APP_URL, sameSite: 'Lax' },
		]);
		await context.addInitScript((id) => {
			try {
				localStorage.setItem('selectedOrganization', id as string);
			} catch {
				/* storage blocked — cookie alone still scopes most pages */
			}
		}, String(orgId));
		console.log(`  ⊙ ${persona} org pinned: ${orgId}`);
	} catch {
		/* best effort — fall back to default scope */
	}
}

async function loginAsDemo(context: BrowserContext, persona: Persona): Promise<void> {
	const endpoint = LOGIN_ENDPOINT[persona];
	const result = await context.request.post(`${APP_URL}${endpoint}`, {
		headers: { 'content-type': 'application/json' },
	});
	if (!result.ok()) {
		const body = await result.text().catch(() => '<no body>');
		throw new Error(`${persona} demo-login failed: ${result.status()} ${result.statusText()} — ${body}`);
	}
}

async function captureOne(context: BrowserContext, shot: Shot): Promise<void> {
	const viewport = VIEWPORTS[shot.viewport];
	// A single logged-in context per persona is reused across all of its shots
	// (see getPersonaContext in main) — one demo-login total per persona
	// instead of one per shot, which previously tripped the prod login
	// rate-limiter after ~15 captures. Per-shot viewport is applied to the
	// page here; deviceScaleFactor is fixed at context creation (all shots @2x).
	const page = await context.newPage();
	await page.setViewportSize({ width: viewport.width, height: viewport.height });
	await page.addStyleTag({ content: HIDE_OVERLAYS_CSS }).catch(() => {
		/* addStyleTag can race with early navigation; re-applied after goto below. */
	});

	const url = await shot.resolveUrl({ page, baseUrl: APP_URL });
	console.log(`  → ${shot.slug}  ${url}`);

	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
	// Re-inject overlay-hiding after the hard navigation replaced the DOM.
	await page.addStyleTag({ content: HIDE_OVERLAYS_CSS });
	// Wait for any "Loading…" text AND skeleton placeholders (animate-pulse
	// gray bars) to disappear. Both are marketing-unfriendly. 30s covers
	// heavy pages (command-center gantt + AI analyze pass for Priority
	// Actions, financials charts) on cold-context captures; shorter pages
	// exit this early via the predicate.
	await page
		.waitForFunction(
			() => {
				const txt = document.body.innerText;
				if (/loading\b/i.test(txt)) return false;
				// Skeleton placeholders (e.g. Priority Actions while AI engine
				// is analyzing). Don't wait forever — if N skeletons are
				// persistent because the page is genuinely empty, the outer
				// timeout breaks us out.
				if (document.querySelectorAll('.animate-pulse').length > 0) return false;
				return true;
			},
			{ timeout: 30000 },
		)
		.catch(() => { /* fall through — capture whatever's there */ });
	await page.waitForTimeout(SETTLE_MS);
	if (shot.waitFor) await shot.waitFor(page);

	const datedPath = resolve(DATED_DIR, `${shot.slug}.png`);
	const latestPath = resolve(LATEST_DIR, `${shot.slug}.png`);
	await page.screenshot({ path: datedPath, fullPage: false });
	await copyFile(datedPath, latestPath);

	await page.close();
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log(`Capturing demo screenshots`);
	console.log(`  app       : ${APP_URL}`);
	console.log(`  archive   : ${DATED_DIR}`);
	console.log(`  latest    : ${LATEST_DIR}`);

	// Per-run archive folder under YYYY-MM/ — each run is its own snapshot
	// so we never lose a prior capture. latest/ is overwritten file-by-file
	// and is what feature pages read from.
	await mkdir(DATED_DIR, { recursive: true });
	await mkdir(LATEST_DIR, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	// One shared, already-authenticated context per persona, created lazily on
	// first use. Keeps demo-logins to one per persona (was one per shot, which
	// tripped the prod login rate-limiter after ~15 captures). All shots use
	// deviceScaleFactor 2, so a single context dsf serves every viewport.
	const contexts = new Map<Persona, BrowserContext>();
	const failedPersonas = new Set<Persona>();
	async function getPersonaContext(persona: Persona): Promise<BrowserContext> {
		let ctx = contexts.get(persona);
		if (!ctx) {
			ctx = await browser.newContext({ deviceScaleFactor: 2 });
			await loginAsDemo(ctx, persona);
			await pinSelectedOrg(ctx, persona);
			// Pin the default appearance toggles (glass chrome + palette tint ON)
			// so captures render the real default Neutral look. These are
			// localStorage-only client prefs the seed can't set server-side.
			await ctx.addInitScript(() => {
				try {
					localStorage.setItem('earnest.appGlassChrome', 'true');
					localStorage.setItem('earnest.appPaletteTint', 'true');
				} catch {
					/* storage blocked — palette (app_palette) alone still applies */
				}
			});
			contexts.set(persona, ctx);
		}
		return ctx;
	}
	try {
		// Capture sequentially — demo data is shared, so we keep the app's
		// server load predictable and make errors easier to diagnose.
		for (const shot of SHOTS) {
			if (shot.persona === 'agency' && !AGENCY_AVAILABLE) {
				console.log(`  ⊘ ${shot.slug} (skipped — no DEMO_AGENCY_USER_PASSWORD)`);
				continue;
			}
			if (failedPersonas.has(shot.persona)) {
				console.log(`  ⊘ ${shot.slug} (skipped — ${shot.persona} login unavailable)`);
				continue;
			}
			let context: BrowserContext;
			try {
				context = await getPersonaContext(shot.persona);
			} catch (err) {
				failedPersonas.add(shot.persona);
				console.error(`✗ ${shot.persona} login failed — skipping all ${shot.persona} shots: ${(err as Error).message}`);
				continue;
			}
			try {
				await captureOne(context, shot);
			} catch (err) {
				console.error(`✗ ${shot.slug}: ${(err as Error).message}`);
				// Keep going — we'd rather have N-1 shots than 0.
			}
		}
	} finally {
		for (const ctx of contexts.values()) await ctx.close();
		await browser.close();
	}

	console.log('✓ Done.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
