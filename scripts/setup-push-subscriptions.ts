#!/usr/bin/env npx tsx
/**
 * push_subscriptions — Phase 5 (Web Push notifications)
 *
 * Creates a single collection that stores per-origin Web Push subscriptions
 * for every user (Earnest at app.earnest.guru AND CardDesk at
 * carddesk.earnest.guru — each origin gets its own row per device).
 *
 *   push_subscriptions
 *     id            uuid (pk)
 *     user          uuid m2o → directus_users (CASCADE)
 *     origin        string (e.g. "https://app.earnest.guru")
 *     endpoint      string UNIQUE — the push service URL Chrome/Apple gave us
 *     p256dh        string — base64url-encoded client public key
 *     auth          string — base64url-encoded client auth secret
 *     user_agent    string nullable — for debug + "from another device" UX
 *     last_seen_at  timestamp nullable — refreshed on every successful push
 *     date_created  timestamp auto
 *     date_updated  timestamp auto
 *
 * Also generates a VAPID keypair (P-256 ECDSA) and writes it to
 * `.env.vapid.local` at the repo root (gitignored via .env.* rule). Idempotent:
 * if the file already exists, the existing keys are preserved.
 *
 * Run:
 *   pnpm tsx scripts/setup-push-subscriptions.ts
 *
 * After running:
 *   1. Copy VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT from
 *      .env.vapid.local into BOTH Vercel projects (earnest + carddesk).
 *   2. Add the same vars to your local .env so dev pushes work.
 *   3. Regenerate types: pnpm generate:types
 */

import 'dotenv/config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { generateKeyPairSync } from 'node:crypto'
import { resolve } from 'node:path'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:peter@huestudios.com'

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
	process.exit(1)
}

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
	try {
		const response = await fetch(`${DIRECTUS_URL}${path}`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${DIRECTUS_TOKEN}`,
			},
			body: body ? JSON.stringify(body) : undefined,
		})
		const text = await response.text()
		if (!response.ok) {
			if (response.status === 409) return { data: null, error: 'already_exists' }
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
				return { data: null, error: 'already_exists' }
			}
			return { data: null, error: `${response.status}: ${text}` }
		}
		const json = text ? JSON.parse(text) : {}
		return { data: json.data ?? null, error: null }
	} catch (err: any) {
		return { data: null, error: err.message }
	}
}

async function createCollection(collection: string, meta: Record<string, any>) {
	console.log(`  Creating collection: ${collection}`)
	const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} })
	if (error === 'already_exists') {
		console.log(`    -> Already exists, skipping`)
		return true
	}
	if (error) {
		console.error(`    -> Error: ${error}`)
		return false
	}
	console.log(`    -> Created`)
	return true
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`)
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field)
	if (error === 'already_exists' || error?.includes('already exists')) {
		console.log(`    -> Already exists, skipping`)
		return true
	}
	if (error) {
		console.error(`    -> Error: ${error}`)
		return false
	}
	console.log(`    -> Created`)
	return true
}

async function createRelation(data: Record<string, any>) {
	console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`)
	const { error } = await directusRequest('/relations', 'POST', data)
	if (error === 'already_exists') {
		console.log(`    -> Already exists, skipping`)
		return true
	}
	if (error) {
		console.error(`    -> Error: ${error}`)
		return false
	}
	console.log(`    -> Created`)
	return true
}

async function setupPushSubscriptions() {
	console.log('\n=== push_subscriptions ===')

	await createCollection('push_subscriptions', {
		icon: 'notifications_active',
		note: 'Per-origin Web Push subscriptions. One row per user × device × origin.',
		color: '#10B981',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{user.first_name}} {{user.last_name}} — {{origin}}',
	})

	await createField('push_subscriptions', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	})

	await createField('push_subscriptions', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
		schema: {},
	})

	await createField('push_subscriptions', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
		schema: {},
	})

	await createField('push_subscriptions', {
		field: 'user',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			note: 'Owner of this push subscription',
			options: { template: '{{first_name}} {{last_name}}' },
		},
		schema: { is_nullable: false },
	})

	await createField('push_subscriptions', {
		field: 'origin',
		type: 'string',
		meta: {
			interface: 'input',
			required: true,
			note: 'The origin that owns this subscription (app.earnest.guru / carddesk.earnest.guru)',
		},
		schema: { is_nullable: false },
	})

	await createField('push_subscriptions', {
		field: 'endpoint',
		type: 'text',
		meta: {
			interface: 'input-multiline',
			required: true,
			note: 'Push service URL returned by the browser. Must be unique — same endpoint = same subscription.',
		},
		schema: { is_nullable: false, is_unique: true },
	})

	await createField('push_subscriptions', {
		field: 'p256dh',
		type: 'string',
		meta: { interface: 'input', required: true, note: 'Client public key (base64url)' },
		schema: { is_nullable: false },
	})

	await createField('push_subscriptions', {
		field: 'auth',
		type: 'string',
		meta: { interface: 'input', required: true, note: 'Client auth secret (base64url)' },
		schema: { is_nullable: false },
	})

	await createField('push_subscriptions', {
		field: 'user_agent',
		type: 'string',
		meta: {
			interface: 'input',
			note: 'Captured at subscribe time for debugging + "scanned on another device" copy',
		},
		schema: { is_nullable: true },
	})

	await createField('push_subscriptions', {
		field: 'last_seen_at',
		type: 'timestamp',
		meta: {
			interface: 'datetime',
			readonly: true,
			note: 'Last time we successfully delivered a push to this endpoint',
		},
		schema: { is_nullable: true },
	})

	await createRelation({
		collection: 'push_subscriptions',
		field: 'user',
		related_collection: 'directus_users',
		schema: { on_delete: 'CASCADE' },
		meta: { sort_field: null },
	})
}

function generateVapidKeys(): { publicKey: string; privateKey: string } {
	// VAPID keys are P-256 ECDSA. The Web Push spec specifies the public key as
	// the uncompressed EC point (65 bytes: 0x04 || X (32) || Y (32)), base64url
	// encoded — and the private key as the raw 32-byte scalar, base64url encoded.
	const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })

	const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
	// The last 65 bytes of an SPKI P-256 public key are the uncompressed EC point.
	const ecPoint = spki.subarray(spki.length - 65)
	const vapidPublic = ecPoint.toString('base64url')

	const jwk = privateKey.export({ format: 'jwk' }) as { d?: string }
	if (!jwk.d) throw new Error('Failed to extract private scalar from JWK')
	const vapidPrivate = jwk.d

	return { publicKey: vapidPublic, privateKey: vapidPrivate }
}

function setupVapidKeys() {
	console.log('\n=== VAPID keys ===')
	const target = resolve(process.cwd(), '.env.vapid.local')

	if (existsSync(target)) {
		console.log(`  Existing ${target} found — preserving keys.`)
		const existing = readFileSync(target, 'utf8')
		console.log('  Preview:')
		console.log(
			existing
				.split('\n')
				.filter((l) => l.startsWith('VAPID_PUBLIC_KEY='))
				.map((l) => `    ${l.slice(0, 40)}...`)
				.join('\n') || '    (no VAPID_PUBLIC_KEY in file)',
		)
		return
	}

	const { publicKey, privateKey } = generateVapidKeys()
	const body = [
		'# Generated by scripts/setup-push-subscriptions.ts',
		'# Copy these into Vercel for BOTH the earnest and carddesk projects.',
		'# Add to local .env to test push delivery in dev.',
		'',
		`VAPID_PUBLIC_KEY=${publicKey}`,
		`VAPID_PRIVATE_KEY=${privateKey}`,
		`VAPID_SUBJECT=${VAPID_SUBJECT}`,
		'',
	].join('\n')

	writeFileSync(target, body, 'utf8')
	console.log(`  Wrote ${target}`)
	console.log(`    VAPID_PUBLIC_KEY=${publicKey}`)
	console.log(`    (private key + subject saved to file — do not commit)`)
}

async function main() {
	console.log('==========================================')
	console.log('  Phase 5 — push_subscriptions + VAPID keys')
	console.log('==========================================')
	console.log(`Directus URL: ${DIRECTUS_URL}`)
	console.log('')

	await setupPushSubscriptions()
	setupVapidKeys()

	console.log('')
	console.log('==========================================')
	console.log('  Done')
	console.log('==========================================')
	console.log('Next:')
	console.log('  1. Copy VAPID_* from .env.vapid.local into Vercel envs for both projects.')
	console.log('  2. Add the same vars to your local .env.')
	console.log('  3. pnpm generate:types to refresh shared/directus.ts.')
}

main().catch((err) => {
	console.error('Fatal:', err)
	process.exit(1)
})
