// server/api/digest/test.post.ts
//
// Authenticated SELF-test for the motivational digest. Builds the digest from
// the caller's OWN real data and sends it to their OWN email immediately —
// bypassing the cadence/send-hour schedule — so you can see a real digest in
// your inbox on demand.
//
// Works independently of the ai_preferences digest fields (uses default
// sections), so it's usable before scripts/setup-motivational-digest.ts runs.
// Only ever sends to the logged-in user.
//
// Optional JSON body:
//   orgId?    — which org to summarise (defaults to the caller's first membership)
//   tone?     — 'motivational' | 'forward' | 'wins' (defaults to today's tone)
//   sections? — string[] override (defaults to DEFAULT_DIGEST_SECTIONS)

import { readUsers, readItems } from '@directus/sdk';
import { buildDigestPayload } from '~~/server/utils/motivational-digest';
import { sendMotivationalDigest } from '~~/server/utils/motivational-digest-email';
import { DEFAULT_DIGEST_SECTIONS, digestTone, localHourAndDay, type DigestTone } from '~~/shared/digest';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const config = useRuntimeConfig();
	const appUrl = (config.public as any)?.appUrl || 'https://app.earnest.guru';
	const body = (await readBody(event).catch(() => ({}))) as any;
	const directus = getServerDirectus();

	// Recipient = the caller (email/name/timezone from the core users collection).
	const users = (await directus
		.request(readUsers({ filter: { id: { _eq: userId } } as any, fields: ['email', 'first_name', 'timezone'] as any, limit: 1 }))
		.catch(() => [])) as any[];
	const me = users[0];
	if (!me?.email) return { ok: false, reason: 'No email address on your account.' };

	// Org = explicit override, else the caller's first membership.
	let orgId: string | null = body?.orgId || null;
	if (!orgId) {
		const memberships = (await directus
			.request(readItems('organizations_directus_users' as any, {
				filter: { directus_users_id: { _eq: userId } } as any,
				fields: ['organizations_id'] as any,
				limit: 1,
			}))
			.catch(() => [])) as any[];
		const m = memberships[0]?.organizations_id;
		orgId = (typeof m === 'object' ? m?.id : m) || null;
	}
	if (!orgId) return { ok: false, reason: 'No organization found for your account.' };

	const now = new Date();
	const tone: DigestTone = ['motivational', 'forward', 'wins'].includes(body?.tone)
		? body.tone
		: digestTone(localHourAndDay(now, me.timezone).weekday);
	// Sections + lead-with-actions: explicit body overrides win (preview any
	// shape), else the caller's saved preferences, else the defaults.
	const prefRows = (await directus
		.request(readItems('ai_preferences' as any, {
			filter: { user: { _eq: userId } } as any,
			fields: ['motivational_digest_sections', 'motivational_digest_lead_with_actions'] as any,
			limit: 1,
		}))
		.catch(() => [])) as any[];
	const pref = prefRows[0] || {};

	const sections = Array.isArray(body?.sections) && body.sections.length
		? body.sections
		: (Array.isArray(pref.motivational_digest_sections) && pref.motivational_digest_sections.length ? pref.motivational_digest_sections : DEFAULT_DIGEST_SECTIONS);
	const leadWithActions = body?.leadWithActions !== undefined
		? (body.leadWithActions === true || body.leadWithActions === 'true')
		: !!pref.motivational_digest_lead_with_actions;

	const payload = await buildDigestPayload({ directus, userId, orgId, tone, sections, leadWithActions, now });
	if (!payload.hasContent) {
		return { ok: false, reason: 'Nothing to report for this org right now — try the layout preview at /api/email/preview-motivational-digest.' };
	}

	// AI copy when enabled for the env, or forced per-request with { ai: true }.
	const aiEnabled = String((config as any).digestAi ?? process.env.NUXT_DIGEST_AI ?? '') === 'true';
	const ai = body?.ai === true || body?.ai === 'true' || aiEnabled;

	const res = await sendMotivationalDigest({ to: me.email, firstName: me.first_name, payload, orgId, appUrl, ai });
	return res.sent
		? { ok: true, to: me.email, tone, leadWithActions: payload.lean, ai, message: `Test ${payload.lean ? 'action-led' : 'summary'} digest sent to ${me.email}${ai ? ' (AI copy)' : ''}.` }
		: { ok: false, reason: res.reason || 'Send failed.' };
});
