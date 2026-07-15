// server/api/telemetry/upsell.post.ts
/**
 * POST /api/telemetry/upsell
 *
 * Logs a willingness-to-pay signal into `upsell_events` — e.g. a click on
 * the locked "Your Brand" palette swatch (Brand Light probe, monetization
 * ladder rung 2). Session-required so the signal maps to a real user;
 * written with the server token so the collection needs no client perms.
 *
 * Body: { feature: 'brand_light', source?: string, organization?: uuid }
 */
import { createItem, readMe } from '@directus/sdk';
import { getServerDirectus, getUserDirectus } from '~~/server/utils/directus';

const FEATURES = new Set(['brand_light']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
	let userId: string | null = null;
	try {
		const client = await getUserDirectus(event);
		const me = (await client.request(readMe({ fields: ['id'] }))) as { id?: string };
		userId = me?.id ?? null;
	} catch {
		throw createError({ statusCode: 401, message: 'Sign in required' });
	}
	if (!userId) throw createError({ statusCode: 401, message: 'Sign in required' });

	const body = await readBody(event).catch(() => ({}) as Record<string, unknown>);
	const feature = String(body?.feature ?? '');
	if (!FEATURES.has(feature)) {
		throw createError({ statusCode: 400, message: 'Unknown feature' });
	}
	const source = typeof body?.source === 'string' ? body.source.slice(0, 64) : null;
	const organization =
		typeof body?.organization === 'string' && UUID_RE.test(body.organization) ? body.organization : null;

	const admin = getServerDirectus();
	await admin.request(createItem('upsell_events', { feature, source, user: userId, organization }));

	return { ok: true };
});
