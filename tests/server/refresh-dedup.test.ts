/**
 * Cross-instance refresh-token dedup — the root-cause fix for premature session
 * death (avatar shows, every Directus call 401s).
 *
 * Directus rotates refresh tokens (single-use). On Vercel the app runs across
 * many lambda instances that don't share the in-process L1 cache, so a burst
 * (parallel /api/directus/* calls + the socket's /api/websocket/token re-auth +
 * the client's proactive timer) landing on different instances would each try
 * to rotate the SAME token; only one wins, the rest 401 and the session dies.
 *
 * dedupedDirectusRefresh now elects ONE rotator via a Redis lock keyed by the
 * token hash and republishes the result for everyone else. These tests simulate
 * multiple instances by importing the module twice (vi.resetModules gives each
 * import its own fresh L1 state) while both share one fake Redis + one network
 * counter, then assert that concurrent/straggling refreshes collapse to a single
 * real rotation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared across every (re-)import of the mocked modules. `vi.hoisted` runs once
// for the file and survives vi.resetModules(), so the network counter and the
// fake Redis are genuinely shared between the simulated instances.
const shared = vi.hoisted(() => {
	// Minimal Redis fake: get / set (with PX + NX) / del, with TTL expiry.
	function makeFakeRedis() {
		const store = new Map<string, { v: string; exp: number }>();
		const alive = (e: { exp: number } | undefined) => !!e && e.exp > Date.now();
		return {
			_clear() {
				store.clear();
			},
			async get(k: string) {
				const e = store.get(k);
				if (!alive(e)) {
					store.delete(k);
					return null;
				}
				return e!.v;
			},
			async set(k: string, v: string, ...args: any[]) {
				let px = Infinity;
				let nx = false;
				for (let i = 0; i < args.length; i++) {
					const a = String(args[i]).toUpperCase();
					if (a === 'PX') {
						px = Date.now() + Number(args[++i]);
					} else if (a === 'NX') {
						nx = true;
					}
				}
				const existing = store.get(k);
				if (nx && alive(existing)) return null; // key held → acquire fails
				store.set(k, { v: String(v), exp: px });
				return 'OK';
			},
			async del(k: string) {
				store.delete(k);
				return 1;
			},
		};
	}

	return {
		net: { n: 0 }, // count of real Directus rotations (network calls)
		redis: makeFakeRedis(),
		redisEnabled: true,
		behavior: 'ok' as 'ok' | 'dead' | 'transient',
	};
});

// Directus SDK: createDirectus(...).with(...).with(...).request(refresh(...))
// increments the shared network counter and returns a freshly rotated pair,
// or throws to simulate a dead token (401) / transient outage (500).
vi.mock('@directus/sdk', () => ({
	createDirectus: () => ({
		with() {
			return this;
		},
		async request() {
			shared.net.n++;
			const n = shared.net.n;
			await new Promise((r) => setTimeout(r, 25)); // network latency → real overlap
			if (shared.behavior === 'dead') {
				throw Object.assign(new Error('token rejected'), {
					response: { status: 401 },
					statusCode: 401,
				});
			}
			if (shared.behavior === 'transient') {
				throw Object.assign(new Error('directus 5xx'), { response: { status: 500 } });
			}
			return { access_token: `AT-${n}`, refresh_token: `RT-${n}`, expires: 900_000 };
		},
	}),
	rest: () => ({}),
	authentication: () => ({}),
	refresh: (o: any) => o,
	login: () => ({}),
	logout: () => ({}),
	readMe: () => ({}),
}));

// The shared Redis singleton (or null when we simulate Redis being unavailable).
vi.mock('~~/server/utils/queue', () => ({
	getRedisConnection: () => (shared.redisEnabled ? shared.redis : null),
	getAIQueue: () => null,
}));

vi.stubGlobal('useRuntimeConfig', () => ({
	directus: { url: 'http://directus.test' },
	public: { directusUrl: 'http://directus.test' },
}));
vi.stubGlobal('createError', (e: any) => Object.assign(new Error(e?.message), e));

async function freshInstance() {
	vi.resetModules();
	return await import('~~/server/utils/directus');
}

beforeEach(() => {
	shared.net.n = 0;
	shared.redis._clear();
	shared.redisEnabled = true;
	shared.behavior = 'ok';
});

describe('dedupedDirectusRefresh — cross-instance dedup', () => {
	it('collapses a concurrent burst across two instances to ONE rotation', async () => {
		const A = await freshInstance();
		const B = await freshInstance();

		const results = await Promise.all([
			A.dedupedDirectusRefresh('RT1'),
			A.dedupedDirectusRefresh('RT1'),
			B.dedupedDirectusRefresh('RT1'),
			B.dedupedDirectusRefresh('RT1'),
		]);

		// Exactly one instance actually called Directus.
		expect(shared.net.n).toBe(1);
		// Everyone received the same rotated token — nobody got a 401.
		const tokens = new Set(results.map((r) => r.refresh_token));
		expect(tokens).toEqual(new Set(['RT-1']));
	});

	it('a later straggler on another instance reuses the published rotation', async () => {
		const A = await freshInstance();
		const first = await A.dedupedDirectusRefresh('RT1'); // rotates, publishes to Redis

		const B = await freshInstance(); // fresh instance, empty L1
		const second = await B.dedupedDirectusRefresh('RT1'); // must hit Redis result cache

		expect(shared.net.n).toBe(1); // no second network rotation
		expect(second.refresh_token).toBe(first.refresh_token);
	});

	it('without Redis, falls back to per-instance L1 dedup (previous behaviour)', async () => {
		shared.redisEnabled = false;

		const A = await freshInstance();
		const B = await freshInstance();

		// Same instance still collapses concurrent calls via L1...
		await Promise.all([A.dedupedDirectusRefresh('RT1'), A.dedupedDirectusRefresh('RT1')]);
		expect(shared.net.n).toBe(1);

		// ...but a second instance has no shared state, so it rotates on its own.
		await B.dedupedDirectusRefresh('RT1');
		expect(shared.net.n).toBe(2);
	});
});

describe('dedupedDirectusRefresh — dead-token tombstone (no thundering herd)', () => {
	it('a confirmed-dead token fast-fails waiters with ONE Directus call', async () => {
		shared.behavior = 'dead';
		const A = await freshInstance();
		const B = await freshInstance();

		const settled = await Promise.allSettled([
			A.dedupedDirectusRefresh('RT1'),
			B.dedupedDirectusRefresh('RT1'),
		]);

		// Both callers see the failure...
		expect(settled.every((s) => s.status === 'rejected')).toBe(true);
		// ...but only the elected rotator hit Directus; the waiter read the
		// tombstone instead of stampeding the dead token.
		expect(shared.net.n).toBe(1);
		// The rejection is a definitive 401 (→ client tears the session down).
		const reason: any = (settled[0] as PromiseRejectedResult).reason ?? (settled[1] as PromiseRejectedResult).reason;
		expect(reason?.statusCode ?? reason?.response?.status).toBe(401);
	});

	it('a straggler within the tombstone window fast-fails without a network call', async () => {
		shared.behavior = 'dead';
		const A = await freshInstance();
		await A.dedupedDirectusRefresh('RT1').catch(() => {}); // publishes tombstone
		expect(shared.net.n).toBe(1);

		const B = await freshInstance();
		await expect(B.dedupedDirectusRefresh('RT1')).rejects.toMatchObject({ statusCode: 401 });
		expect(shared.net.n).toBe(1); // no second Directus hit
	});
});

describe('dedupedDirectusRefresh — transient failures are not poisoned', () => {
	it('a 5xx is NOT tombstoned, so a later attempt retries Directus (not a logout)', async () => {
		shared.behavior = 'transient';
		const A = await freshInstance();

		await expect(A.dedupedDirectusRefresh('RT1')).rejects.toBeTruthy();
		expect(shared.net.n).toBe(1);

		// Recovery: the token was never dead, so the next attempt must actually
		// call Directus again and succeed — proving no dead tombstone was cached.
		shared.behavior = 'ok';
		const ok = await A.dedupedDirectusRefresh('RT1');
		expect(ok.refresh_token).toBe('RT-2');
		expect(shared.net.n).toBe(2);
	});
});
