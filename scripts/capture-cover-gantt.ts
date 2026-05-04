/**
 * Capture social cover photos from /cover-gantt.html.
 *
 * Outputs:
 *   docs/marketing/covers/facebook-cover.png   (1640×856, FB cover dims)
 *   docs/marketing/covers/linkedin-cover.png   (1584×396, LinkedIn cover dims)
 *
 * Run with the dev server up: pnpm tsx scripts/capture-cover-gantt.ts
 */

import { chromium } from 'playwright';
import * as path from 'node:path';

const URL_FB = 'http://127.0.0.1:3000/cover-gantt.html';
const URL_LI = 'http://127.0.0.1:3000/cover-gantt.html?variant=linkedin';
const OUT_DIR = path.resolve('docs/marketing/covers');

async function main() {
	const browser = await chromium.launch();

	// Facebook 1640×856
	{
		const page = await browser.newPage({ viewport: { width: 1640, height: 856 }, deviceScaleFactor: 2 });
		await page.goto(URL_FB, { waitUntil: 'networkidle' });
		await page.waitForTimeout(300);
		await page.screenshot({ path: path.join(OUT_DIR, 'facebook-cover.png'), type: 'png', fullPage: false });
		await page.close();
	}

	// LinkedIn 1584×396
	{
		const page = await browser.newPage({ viewport: { width: 1584, height: 396 }, deviceScaleFactor: 2 });
		await page.goto(URL_LI, { waitUntil: 'networkidle' });
		await page.waitForTimeout(300);
		await page.screenshot({ path: path.join(OUT_DIR, 'linkedin-cover.png'), type: 'png', fullPage: false });
		await page.close();
	}

	await browser.close();
	console.log('✓ Wrote covers to', OUT_DIR);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
