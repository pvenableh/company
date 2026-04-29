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
import { mkdir, rm, copyFile } from 'node:fs/promises';
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

/** YYYY-MM slug for the dated output folder. */
const now = new Date();
const MONTH_SLUG = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const DATED_DIR = resolve(MARKETING_REPO, 'public/screenshots', MONTH_SLUG);
const LATEST_DIR = resolve(MARKETING_REPO, 'public/screenshots/latest');

// Debounce after `domcontentloaded` — gives sticky header/sidebar and any
// animations a beat to settle before the shutter fires.
const SETTLE_MS = 2500;

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

type ViewportPreset = 'hero' | 'inline';

const VIEWPORTS: Record<ViewportPreset, { width: number; height: number; deviceScaleFactor: number }> = {
	// Hero shot is larger & higher density — used for above-the-fold art.
	hero: { width: 1440, height: 900, deviceScaleFactor: 2 },
	// Inline shots on feature pages — slightly smaller.
	inline: { width: 1280, height: 720, deviceScaleFactor: 2 },
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
	},
	{
		slug: 'leads-pipeline',
		viewport: 'inline',
		persona: 'solo',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/leads`,
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
		resolveUrl: async (ctx) => `${ctx.baseUrl}${await firstDetailHref(ctx.page, '/clients', ctx.baseUrl)}`,
	},
	{
		slug: 'project-timeline',
		viewport: 'inline',
		persona: 'solo',
		resolveUrl: async (ctx) => `${ctx.baseUrl}${await firstDetailHref(ctx.page, '/projects', ctx.baseUrl)}`,
	},
	{
		slug: 'tickets-kanban',
		viewport: 'inline',
		persona: 'solo',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/tickets`,
	},
	{
		slug: 'financials-overview',
		viewport: 'inline',
		persona: 'solo',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/financials`,
	},

	// ── Agency (Admin role) — shots that Member role would render empty or 403 ──
	{
		slug: 'marketing-overview',
		viewport: 'inline',
		persona: 'agency',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/marketing`,
	},
	{
		slug: 'organization-overview',
		viewport: 'inline',
		persona: 'agency',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/organization`,
	},
	{
		slug: 'organization-teams',
		viewport: 'inline',
		persona: 'agency',
		resolveUrl: async ({ baseUrl }) => `${baseUrl}/organization/teams`,
	},
	{
		slug: 'team-detail',
		viewport: 'inline',
		persona: 'agency',
		resolveUrl: async (ctx) => `${ctx.baseUrl}${await firstDetailHref(ctx.page, '/teams', ctx.baseUrl)}`,
	},
];

// ─── Helpers ────────────────────────────────────────────────────────────

async function firstDetailHref(page: Page, listPath: string, baseUrl: string): Promise<string> {
	// Establish an origin for the page-side fetch so the relative URL works
	// and the auth cookie is in scope. Use `domcontentloaded` (not
	// `networkidle`) — the list pages keep notification long-polls open
	// indefinitely and `networkidle` never resolves on prod.
	if (page.url() === 'about:blank') {
		await page.goto(`${baseUrl}/command-center`, { waitUntil: 'domcontentloaded', timeout: 15000 });
	}

	// Hit the items endpoint via the page's authed session and grab the
	// first row id. More deterministic than scraping the rendered list
	// (which uses `router.push()` clicks instead of `<a href>`).
	const collection = listPath.replace(/^\//, '');
	const id = await page.evaluate(async (col) => {
		try {
			const res = await fetch(`/api/directus/items`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					collection: col,
					operation: 'list',
					query: { limit: 1, fields: ['id'] },
				}),
			});
			if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 120)}` };
			const json = await res.json().catch(() => null);
			return { id: json?.data?.[0]?.id ?? null };
		} catch (err) {
			return { error: String(err) };
		}
	}, collection);
	if (typeof id === 'object' && id && 'id' in id && id.id) return `${listPath}/${id.id}`;
	if (typeof id === 'object' && id && 'error' in id) {
		console.warn(`  ⚠ ${listPath} resolver: ${id.error}`);
	}

	throw new Error(`No seeded detail rows found under ${listPath}. Re-run scripts/setup-demo-org.ts?`);
}

const LOGIN_ENDPOINT: Record<Persona, string> = {
	solo: '/api/auth/demo-login',
	agency: '/api/auth/demo-agency-login',
};

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

async function captureOne(browser: Browser, shot: Shot): Promise<void> {
	const viewport = VIEWPORTS[shot.viewport];
	const context = await browser.newContext({
		viewport: { width: viewport.width, height: viewport.height },
		deviceScaleFactor: viewport.deviceScaleFactor,
	});
	// Each context gets its own login so we can mix viewports AND personas
	// freely. Demo login is cheap (reads env password + one Directus auth
	// round-trip).
	await loginAsDemo(context, shot.persona);

	const page = await context.newPage();
	await page.addStyleTag({ content: HIDE_OVERLAYS_CSS }).catch(() => {
		/* addStyleTag can race with early navigation; re-applied after goto below. */
	});

	const url = await shot.resolveUrl({ page, baseUrl: APP_URL });
	console.log(`  → ${shot.slug}  ${url}`);

	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
	// Re-inject overlay-hiding after the hard navigation replaced the DOM.
	await page.addStyleTag({ content: HIDE_OVERLAYS_CSS });
	await page.waitForTimeout(SETTLE_MS);
	if (shot.waitFor) await shot.waitFor(page);

	const datedPath = resolve(DATED_DIR, `${shot.slug}.png`);
	const latestPath = resolve(LATEST_DIR, `${shot.slug}.png`);
	await page.screenshot({ path: datedPath, fullPage: false });
	await copyFile(datedPath, latestPath);

	await context.close();
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log(`Capturing demo screenshots`);
	console.log(`  app       : ${APP_URL}`);
	console.log(`  dated     : ${DATED_DIR}`);
	console.log(`  latest    : ${LATEST_DIR}`);

	// Wipe & recreate the dated folder so re-runs within the same month
	// overwrite cleanly. latest/ is overwritten file-by-file.
	await rm(DATED_DIR, { recursive: true, force: true });
	await mkdir(DATED_DIR, { recursive: true });
	await mkdir(LATEST_DIR, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	try {
		// Capture sequentially — demo data is shared, so we keep the app's
		// server load predictable and make errors easier to diagnose.
		for (const shot of SHOTS) {
			if (shot.persona === 'agency' && !AGENCY_AVAILABLE) {
				console.log(`  ⊘ ${shot.slug} (skipped — no DEMO_AGENCY_USER_PASSWORD)`);
				continue;
			}
			try {
				await captureOne(browser, shot);
			} catch (err) {
				console.error(`✗ ${shot.slug}: ${(err as Error).message}`);
				// Keep going — we'd rather have N-1 shots than 0.
			}
		}
	} finally {
		await browser.close();
	}

	console.log('✓ Done.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
