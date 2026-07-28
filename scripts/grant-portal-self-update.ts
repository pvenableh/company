// scripts/grant-portal-self-update.ts
// Grant the "Client Portal" policy permission to update its OWN directus_users
// row (id = $CURRENT_USER) with a tight profile field allowlist, so portal
// clients can complete/edit their own profile. Idempotent. Excludes sensitive
// auth fields (email/password/tfa) and avatar-file upload (needs directus_files
// create — handled separately via a server proxy).
import 'dotenv/config';

const URL = (process.env.NUXT_PUBLIC_DIRECTUS_URL || process.env.DIRECTUS_URL || '').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const POLICY = '2d6c66e8-5211-4dca-a696-1e7d868f5d6d'; // Client Portal policy

const FIELDS = [
	'first_name', 'last_name', 'title', 'description',
	'phone', 'cell_phone', 'nickname', 'linkedin', 'github', 'timezone', 'location',
	'language', 'theme', 'theme_light', 'theme_dark', 'theme_light_overrides', 'theme_dark_overrides',
	'app_palette', 'layout_mode', 'app_rail_position', 'view_lens', 'dismissed_app_intros', 'nav_preferences',
	'avatar',
];

async function api(path: string, init?: RequestInit) {
	const r = await fetch(`${URL}${path}`, {
		...init,
		headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(init?.headers || {}) },
	});
	const text = await r.text();
	if (!r.ok) throw new Error(`${r.status} ${init?.method || 'GET'} ${path}: ${text.slice(0, 300)}`);
	return text ? JSON.parse(text).data : null;
}

async function main() {
	// Idempotent: is there already an update perm on directus_users for this policy?
	const existing = await api(`/permissions?filter[policy][_eq]=${POLICY}&filter[collection][_eq]=directus_users&filter[action][_eq]=update&fields=id,fields&limit=-1`);
	if (existing?.length) {
		console.log('Already exists — updating field allowlist. perm id:', existing[0].id);
		await api(`/permissions/${existing[0].id}`, { method: 'PATCH', body: JSON.stringify({ fields: FIELDS, permissions: { id: { _eq: '$CURRENT_USER' } } }) });
		console.log('✅ updated');
		return;
	}
	const created = await api('/permissions', {
		method: 'POST',
		body: JSON.stringify({
			policy: POLICY,
			collection: 'directus_users',
			action: 'update',
			fields: FIELDS,
			permissions: { id: { _eq: '$CURRENT_USER' } },
			validation: null,
			presets: null,
		}),
	});
	console.log('✅ created permission id:', created?.id, '(delete this id to revert)');
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
