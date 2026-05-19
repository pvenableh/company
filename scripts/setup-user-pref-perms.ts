#!/usr/bin/env npx tsx
/**
 * Grant non-admin users the ability to write their own user-pref fields.
 *
 *   pnpm tsx scripts/setup-user-pref-perms.ts
 *
 * Directus's "Client" policy ships with a hardcoded `fields` list on the
 * `directus_users.update` permission. That list only includes the
 * out-of-the-box fields (first_name, last_name, email, password, location,
 * title, description, avatar, language, theme, tfa_secret) — every
 * Earnest-added user-pref field has been silently 403-ing on PATCH /me
 * for users on this policy (Member + Client Manager roles).
 *
 * This script patches that permission to include the user-pref fields the
 * app writes from the client side:
 *   - layout_mode + app_rail_position (Apps Layout shell + rail position)
 *   - app_palette (per-user accent palette)
 *   - view_lens ("For me / For org" lens toggle)
 *   - dismissed_app_intros (Stage 3 intro-card dismissals)
 *   - nav_preferences (sidebar/nav reordering)
 *   - theme_light / theme_dark + override JSONs (Nuxt UI theme picker)
 *   - industry / networking_goal (onboarding profile, editable from /account)
 *
 * All of these are still scoped by the existing `id._eq: $CURRENT_USER`
 * row filter, so users can only update their own row — the field-list
 * expansion does not widen the security surface.
 *
 * Idempotent — re-running merges the field list rather than replacing it.
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!TOKEN) {
	console.error('Missing DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN');
	process.exit(1);
}

const CLIENT_POLICY_ID = 'cdadd1fd-280e-4d4a-83e6-1b911889af46';

const USER_PREF_FIELDS = [
	'layout_mode',
	'app_rail_position',
	'app_palette',
	'view_lens',
	'dismissed_app_intros',
	'nav_preferences',
	'theme_light',
	'theme_dark',
	'theme_light_overrides',
	'theme_dark_overrides',
	'industry',
	'networking_goal',
	'app_pref_carddesk_promo_dismissed_at',
];

async function main() {
	console.log(`Target: ${DIRECTUS_URL}`);
	console.log('Looking up directus_users.update permission on Client policy...');

	const findUrl = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=directus_users&filter[action][_eq]=update&filter[policy][_eq]=${CLIENT_POLICY_ID}&fields=id,fields,policy,collection,action`;
	const findRes = await fetch(findUrl, { headers: { Authorization: `Bearer ${TOKEN}` } });
	if (!findRes.ok) {
		console.error(`  lookup failed ${findRes.status}: ${await findRes.text()}`);
		process.exit(1);
	}
	const found = (await findRes.json()).data as Array<{ id: number; fields: string[] }>;
	if (!found.length) {
		console.error('  no matching permission found — Client policy may have changed');
		process.exit(1);
	}
	const perm = found[0]!;
	console.log(`  perm id=${perm.id}, current fields: ${JSON.stringify(perm.fields)}`);

	const current = new Set(perm.fields ?? []);
	const before = current.size;
	for (const f of USER_PREF_FIELDS) current.add(f);
	if (current.size === before) {
		console.log('  no changes needed (all pref fields already present)');
		console.log('Done.');
		return;
	}
	const next = Array.from(current);
	console.log(`  adding ${current.size - before} field(s): ${USER_PREF_FIELDS.filter((f) => !(perm.fields ?? []).includes(f)).join(', ')}`);

	const patchRes = await fetch(`${DIRECTUS_URL}/permissions/${perm.id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify({ fields: next }),
	});
	if (!patchRes.ok) {
		console.error(`  patch failed ${patchRes.status}: ${await patchRes.text()}`);
		process.exit(1);
	}
	console.log('  patched');
	console.log('Done.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
