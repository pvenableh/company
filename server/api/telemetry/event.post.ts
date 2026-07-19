// server/api/telemetry/event.post.ts
/**
 * POST /api/telemetry/event
 *
 * Generic first-party product-usage sink → `product_events`. One row per
 * meaningful UI interaction (adoption, engagement, feature reach). Session-
 * required so the signal maps to a real user; written with the server token so
 * the collection needs no client perms. Fire-and-forget from the client.
 *
 * Body: { event: string, source?: string, organization?: uuid, props?: object }
 *   - event: namespaced slug, `[a-z0-9_.:-]{1,64}` (e.g. 'home.mode_flipped')
 *   - props: a small flat-ish JSON payload; capped so a client can't dump.
 */
import { createItem, readMe } from '@directus/sdk';
import { getServerDirectus, getUserDirectus } from '~~/server/utils/directus';

const EVENT_RE = /^[a-z0-9_.:-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROPS_BYTES = 2000;

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
	const name = String(body?.event ?? '');
	if (!EVENT_RE.test(name)) {
		throw createError({ statusCode: 400, message: 'Invalid event slug' });
	}
	const source = typeof body?.source === 'string' ? body.source.slice(0, 64) : null;
	const organization =
		typeof body?.organization === 'string' && UUID_RE.test(body.organization) ? body.organization : null;

	// Keep props small and object-shaped; silently drop anything oversized or the
	// wrong type rather than reject the event (the signal matters more than the blob).
	let props: Record<string, unknown> | null = null;
	if (body?.props && typeof body.props === 'object' && !Array.isArray(body.props)) {
		try {
			const json = JSON.stringify(body.props);
			if (json.length <= MAX_PROPS_BYTES) props = body.props as Record<string, unknown>;
		} catch { /* non-serialisable — drop */ }
	}

	const admin = getServerDirectus();
	await admin.request(createItem('product_events', { event: name, source, user: userId, organization, props }));

	return { ok: true };
});
