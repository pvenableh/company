#!/usr/bin/env npx tsx
/**
 * Backfills Client Manager (default Earnest member role) with full CRUD on
 * `comments` and `reactions` so the polymorphic Discussion section on
 * /meetings/[id] (and tickets/projects/events) actually works for non-admins.
 *
 * Before this script: Client Manager had only `comments.read`, so any member
 * trying to leave a comment or react on a meeting recap got 403. The Client
 * (portal) policy already had full CRUD — this script mirrors that shape onto
 * Client Manager.
 *
 * The row filters are author-scoped (the comment/reaction `user` shares an org
 * with the viewer), not collection-scoped, so this is a one-shot fix that
 * covers every CommentsSystem mount including video_meetings.
 *
 * Usage:
 *   pnpm tsx scripts/setup-comments-reactions-perms.ts            # dry-run
 *   pnpm tsx scripts/setup-comments-reactions-perms.ts --apply    # mutate
 *
 * Idempotent: skips any (policy, collection, action) tuple already present.
 */
import 'dotenv/config';

const URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!URL || !TOKEN) {
	console.error('DIRECTUS_URL and DIRECTUS_SERVER_TOKEN are required.');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const POLICY = {
	CLIENT_MANAGER: '012beff9-150c-49e9-a284-1a7e2757e0dd',
} as const;

// Same row filter Client Manager already uses for `comments.read`. Author of
// the comment/reaction must share at least one org with the current viewer.
const AUTHOR_ORG_FILTER = {
	user: {
		organizations: {
			organizations_id: { _in: '$CURRENT_USER.organizations.organizations_id' },
		},
	},
};

interface Spec {
	collection: 'comments' | 'reactions';
	action: 'create' | 'read' | 'update' | 'delete';
	filter: Record<string, any> | null;
}

const REQUIRED: Spec[] = [
	// `comments.read` already exists on Client Manager — listed here so the
	// idempotency check covers it and so the spec is the single source of truth.
	{ collection: 'comments', action: 'read', filter: AUTHOR_ORG_FILTER },
	{ collection: 'comments', action: 'create', filter: AUTHOR_ORG_FILTER },
	{ collection: 'comments', action: 'update', filter: AUTHOR_ORG_FILTER },
	{ collection: 'comments', action: 'delete', filter: AUTHOR_ORG_FILTER },
	// Reactions stay open (filter null = all rows) to mirror the Client policy.
	// Reactions are append-only emoji + user pairs; row-scoping by author would
	// break the typical "see who reacted" rendering.
	{ collection: 'reactions', action: 'read', filter: null },
	{ collection: 'reactions', action: 'create', filter: null },
	{ collection: 'reactions', action: 'update', filter: null },
	{ collection: 'reactions', action: 'delete', filter: null },
];

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
	const r = await fetch(URL + path, {
		...init,
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			'Content-Type': 'application/json',
			...(init?.headers || {}),
		},
	});
	if (!r.ok) {
		const body = await r.text().catch(() => '');
		throw new Error(`${r.status} ${r.statusText} on ${init?.method || 'GET'} ${path}\n${body}`);
	}
	if (r.status === 204) return undefined as any;
	return (await r.json()).data as T;
}

(async () => {
	console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}`);
	const existing = await api<any[]>(
		'/permissions?fields=id,policy,collection,action,permissions&filter[policy][_eq]=' +
			POLICY.CLIENT_MANAGER +
			'&filter[collection][_in]=comments,reactions&limit=-1',
	);

	const have = new Set(existing.map((p) => `${p.collection}:${p.action}`));
	const toCreate: Spec[] = REQUIRED.filter((s) => !have.has(`${s.collection}:${s.action}`));

	if (toCreate.length === 0) {
		console.log('Nothing to do — Client Manager already has every (collection, action) tuple.');
		process.exit(0);
	}

	console.log(`Will create ${toCreate.length} permission row(s) on Client Manager:`);
	for (const s of toCreate) console.log(`  + ${s.collection}.${s.action} ${s.filter ? '(author-org filtered)' : '(all rows)'}`);

	if (!APPLY) {
		console.log('\nDry-run — pass --apply to commit.');
		process.exit(0);
	}

	for (const s of toCreate) {
		await api('/permissions', {
			method: 'POST',
			body: JSON.stringify({
				policy: POLICY.CLIENT_MANAGER,
				collection: s.collection,
				action: s.action,
				permissions: s.filter,
				fields: ['*'],
			}),
		});
		console.log(`  ✓ created ${s.collection}.${s.action}`);
	}

	console.log('\nDone.');
})();
