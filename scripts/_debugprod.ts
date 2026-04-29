import { chromium } from 'playwright';

async function main() {
	const APP_URL = 'http://127.0.0.1:3000';
	const browser = await chromium.launch();
	const context = await browser.newContext();

	const r = await context.request.post(`${APP_URL}/api/auth/demo-login`, {
		headers: { 'content-type': 'application/json' },
	});
	console.log('login:', r.status(), (await r.text()).slice(0, 200));

	const page = await context.newPage();
	// First load the root — gives the client time to hydrate the session ref.
	await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.waitForTimeout(3000);
	console.log('after /:', page.url());

	await page.goto(`${APP_URL}/command-center`, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.waitForTimeout(3000);
	console.log('after /command-center:', page.url());

	const userId = '067e56df-5616-4636-b811-8fd5fc4aef9f';
	for (const [name, query] of [
		['orgs (composable filter)', { filter: { users: { directus_users_id: { _eq: userId } }, active: { _neq: false } }, fields: ['id', 'name', 'archived_at'] }],
		['orgs (no filter)', { fields: ['id', 'name'] }],
		['memberships (composable filter)', { filter: { user: { _eq: userId }, status: { _eq: 'active' } }, fields: ['id', 'organization', 'role.id'] }],
	] as const) {
		const probe = await page.evaluate(async ({ collection, query }) => {
			const res = await fetch('/api/directus/items', {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ collection, operation: 'list', query }),
			});
			return { status: res.status, body: (await res.text()).slice(0, 400) };
		}, { collection: name.includes('memberships') ? 'org_memberships' : 'organizations', query });
		console.log(`${name}:`, probe);
	}

	await browser.close();
}
main().catch(console.error);
