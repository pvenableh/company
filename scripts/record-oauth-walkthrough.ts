#!/usr/bin/env tsx
/**
 * record-oauth-walkthrough.ts
 *
 * Drives a headless Chromium through the demo workspace and records a
 * 60–90s walkthrough that exercises the OAuth scopes we request from
 * Google, LinkedIn, Meta (Facebook/Instagram), and TikTok. The output
 * video is what we attach to each provider's app-review form.
 *
 * Usage:
 *   DEMO_AGENCY_USER_PASSWORD=… \
 *   APP_URL=http://localhost:3000 \
 *   pnpm tsx scripts/record-oauth-walkthrough.ts
 *
 * Output:
 *   /tmp/oauth-walkthrough/oauth-walkthrough-<YYYY-MM-DD>.webm
 *
 * The webm master is what Playwright produces. Run ffmpeg afterwards
 * to produce a sibling .mp4 (LinkedIn and a few others reject webm).
 */
import { mkdir, rm, readdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const DEMO_AGENCY_USER_PASSWORD = process.env.DEMO_AGENCY_USER_PASSWORD;

if (!DEMO_AGENCY_USER_PASSWORD) {
	console.error('✗ DEMO_AGENCY_USER_PASSWORD is required (see .env / Vercel).');
	process.exit(1);
}

const OUTPUT_DIR = '/tmp/oauth-walkthrough';
const TODAY = new Date().toISOString().slice(0, 10);
const FINAL_NAME = `oauth-walkthrough-${TODAY}.webm`;

const VIEWPORT = { width: 1440, height: 900 };

// Inject CSS to hide developer/internal overlays that should not appear in
// the recording (floating AI dock, devtools anchor, Nuxt inspector).
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

async function loginAsAgencyDemo(context: BrowserContext): Promise<void> {
	const result = await context.request.post(`${APP_URL}/api/auth/demo-agency-login`, {
		headers: { 'content-type': 'application/json' },
	});
	if (!result.ok()) {
		const body = await result.text().catch(() => '<no body>');
		throw new Error(`agency demo-login failed: ${result.status()} ${result.statusText()} — ${body}`);
	}
}

async function gotoAndSettle(page: Page, path: string, settleMs = 1500): Promise<void> {
	const url = `${APP_URL}${path}`;
	console.log(`  → ${path}`);
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.addStyleTag({ content: HIDE_OVERLAYS_CSS }).catch(() => { /* race with navigation */ });
	// Wait for skeletons + "Loading…" to clear, but don't wait forever.
	await page
		.waitForFunction(
			() => {
				const txt = document.body.innerText;
				if (/loading\b/i.test(txt)) return false;
				if (document.querySelectorAll('.animate-pulse').length > 0) return false;
				return true;
			},
			{ timeout: 8000 },
		)
		.catch(() => { /* fall through — record what's there */ });
	await page.waitForTimeout(settleMs);
}

/** Smooth scroll a page from top to bottom over `durationMs`. */
async function smoothScroll(page: Page, durationMs: number): Promise<void> {
	// Pass the function as a string so tsx doesn't inject `__name` helpers
	// that aren't available in the browser context.
	await page.evaluate(
		`new Promise((done) => {
			const duration = ${durationMs};
			const start = performance.now();
			const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
			const step = (now) => {
				const t = Math.min(1, (now - start) / duration);
				const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
				window.scrollTo(0, max * eased);
				if (t < 1) requestAnimationFrame(step);
				else done();
			};
			requestAnimationFrame(step);
		})`,
	);
}

async function firstClientHref(page: Page): Promise<string | null> {
	// Hit the items endpoint via the page's authed session and grab the
	// first client id. More deterministic than scraping rendered links.
	const result = await page.evaluate(async () => {
		try {
			const res = await fetch('/api/directus/items', {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					collection: 'clients',
					operation: 'list',
					query: { limit: 1, fields: ['id'] },
				}),
			});
			if (!res.ok) return null;
			const json = await res.json().catch(() => null);
			const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
			return arr[0]?.id ?? null;
		} catch {
			return null;
		}
	});
	return result ? `/clients/${result}` : null;
}

async function main(): Promise<void> {
	console.log(`Recording OAuth walkthrough`);
	console.log(`  app    : ${APP_URL}`);
	console.log(`  output : ${OUTPUT_DIR}/${FINAL_NAME}`);

	// Reset output dir so re-runs produce clean output.
	await rm(OUTPUT_DIR, { recursive: true, force: true });
	await mkdir(OUTPUT_DIR, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: VIEWPORT,
		recordVideo: { dir: OUTPUT_DIR, size: VIEWPORT },
	});

	try {
		await loginAsAgencyDemo(context);

		const page = await context.newPage();

		// 1) Command center — establishes "real product, real user"
		await gotoAndSettle(page, '/command-center', 4000);

		// 2) Marketing intelligence — high-signal AI surface
		await gotoAndSettle(page, '/marketing', 2000);
		await smoothScroll(page, 5000);
		await page.waitForTimeout(1500);

		// 3) Social settings — THE OAuth surface. Each provider's review needs
		//    to see their connect button + scope-sensitive copy. Linger here.
		await gotoAndSettle(page, '/social/settings', 2500);
		await smoothScroll(page, 7000);
		await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
		await page.waitForTimeout(2500);

		// 4) Social calendar — proves posts are *scheduled*, not blasted
		await gotoAndSettle(page, '/social/calendar', 2000);
		await page.waitForTimeout(4000);

		// 5) Social compose — the "posting intent" surface (TikTok cares)
		await gotoAndSettle(page, '/social/compose', 2000);
		await page.waitForTimeout(4000);

		// 6) Per-client marketing — proves OAuth tokens are scoped per-org-per-client
		const clientHref = await firstClientHref(page);
		if (clientHref) {
			await gotoAndSettle(page, clientHref, 2000);
			await smoothScroll(page, 4000);
			await page.waitForTimeout(2000);
		} else {
			console.warn('  ⚠ no seeded client found — skipping client detail beat');
		}

		// 7) Scheduler — Google calendar OAuth context
		await gotoAndSettle(page, '/scheduler', 2000);
		await page.waitForTimeout(3500);

		// 8) End on social dashboard — closes the "integrated workflow" arc
		await gotoAndSettle(page, '/social', 2000);
		await page.waitForTimeout(2500);
	} finally {
		// Closing the context flushes the video to disk.
		await context.close();
		await browser.close();
	}

	// Playwright auto-names the file <uuid>.webm. Rename to a stable name.
	const files = await readdir(OUTPUT_DIR);
	const webm = files.find((f) => f.endsWith('.webm'));
	if (!webm) {
		console.error('✗ No .webm produced. Did the context close cleanly?');
		process.exit(1);
	}
	const finalPath = resolve(OUTPUT_DIR, FINAL_NAME);
	if (webm !== FINAL_NAME) {
		await rename(resolve(OUTPUT_DIR, webm), finalPath);
	}
	console.log(`✓ ${finalPath}`);
	console.log('  Convert to .mp4 with:');
	console.log(`    ffmpeg -i ${finalPath} -c:v libx264 -crf 23 -preset fast ${finalPath.replace(/\.webm$/, '.mp4')}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
