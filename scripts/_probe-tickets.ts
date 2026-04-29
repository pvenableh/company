import { chromium } from 'playwright';
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.request.post('http://localhost:3000/api/auth/demo-login');
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/command-center', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/directus/items', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'tickets', operation: 'list',
        query: {
          fields: ['id','title','status','assigned_to.id','assigned_to.directus_users_id.id','tasks.id','tasks.status'],
          limit: 5,
        },
      }),
    });
    return { status: res.status, body: (await res.text()).slice(0, 500) };
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
