/**
 * In-memory Directus fake for server-util reconciliation tests.
 *
 * The reconciliation utilities (apply-refund-adjustment, apply-dispute-adjustment,
 * recompute-invoice-status, token clawback) all talk to Directus through the
 * `@directus/sdk` command builders + `directus.request(command)` + the
 * auto-imported `getTypedDirectus()` global. This helper provides:
 *
 *   1. `mockDirectusSdk()` — the object you hand to `vi.mock('@directus/sdk', …)`.
 *      Each command builder returns a plain descriptor object instead of a real
 *      REST command, so the fake can interpret it.
 *   2. `createFakeDirectus(seed)` — an in-memory store whose `.request(descriptor)`
 *      executes the descriptor against arrays of rows. It supports the exact
 *      filter shapes the reconciliation code uses (`_and`, `_or`, `_eq`, `_neq`,
 *      `_in`, `_nnull`, `_gte`, and nested relation fields like `role.slug`).
 *
 * Wire both together in a test's setup, then point the global at the store:
 *
 *   vi.mock('@directus/sdk', () => mockDirectusSdk());
 *   const fake = createFakeDirectus({ payments_received: [...], invoices: [...] });
 *   vi.stubGlobal('getTypedDirectus', () => fake);
 */

type Row = Record<string, any>;
type DB = Record<string, Row[]>;

/** Command-builder mock for `vi.mock('@directus/sdk', …)`. */
export function mockDirectusSdk() {
	return {
		createItem: (collection: string, data: Row) => ({ __cmd: 'createItem', collection, data }),
		readItem: (collection: string, id: string, query?: any) => ({ __cmd: 'readItem', collection, id, query }),
		readItems: (collection: string, query?: any) => ({ __cmd: 'readItems', collection, query }),
		updateItem: (collection: string, id: string, data: Row) => ({ __cmd: 'updateItem', collection, id, data }),
		updateItems: (collection: string, ids: string[], data: Row) => ({ __cmd: 'updateItems', collection, ids, data }),
		deleteItem: (collection: string, id: string) => ({ __cmd: 'deleteItem', collection, id }),
		createNotification: (data: Row) => ({ __cmd: 'createNotification', data }),
		aggregate: (collection: string, opts: any) => ({ __cmd: 'aggregate', collection, opts }),
		// readUsers/updateUser route to the /users endpoint in Directus; the fake
		// treats directus_users as an ordinary in-memory collection.
		readUsers: (query?: any) => ({ __cmd: 'readItems', collection: 'directus_users', query }),
		updateUser: (id: string, data: Row) => ({ __cmd: 'updateItem', collection: 'directus_users', id, data }),
	};
}

function matches(row: Row | undefined, filter: any): boolean {
	if (!filter || typeof filter !== 'object') return true;
	return Object.entries(filter).every(([key, val]) => {
		if (key === '_and') return (val as any[]).every((f) => matches(row, f));
		if (key === '_or') return (val as any[]).some((f) => matches(row, f));

		const fieldVal = row?.[key];
		if (val && typeof val === 'object') {
			return Object.entries(val as any).every(([op, opv]) => {
				switch (op) {
					case '_eq':
						return String(fieldVal) === String(opv);
					case '_neq':
						return String(fieldVal) !== String(opv);
					case '_in':
						return (opv as any[]).map(String).includes(String(fieldVal));
					case '_nin':
						return !(opv as any[]).map(String).includes(String(fieldVal));
					case '_nnull':
						return fieldVal != null;
					case '_null':
						return fieldVal == null;
					case '_gte':
						return fieldVal >= (opv as any);
					case '_lte':
						return fieldVal <= (opv as any);
					default:
						// Nested relation field, e.g. role: { slug: { _in: [...] } }
						return matches(fieldVal ?? {}, { [op]: opv });
				}
			});
		}
		return String(fieldVal) === String(val);
	});
}

function applyLimit<T>(rows: T[], limit: number | undefined): T[] {
	if (limit == null || limit === -1) return rows;
	return rows.slice(0, limit);
}

export interface FakeDirectus {
	db: DB;
	request: (descriptor: any) => Promise<any>;
	/** Every notification created via createNotification, for assertions. */
	notifications: Row[];
	/** Count of writes per collection — handy for idempotency assertions. */
	writes: { create: number; update: number; delete: number };
}

export function createFakeDirectus(seed: Partial<DB> = {}): FakeDirectus {
	const db: DB = {
		payments_received: [],
		invoices: [],
		organizations: [],
		org_memberships: [],
		token_purchases: [],
		platform_reversals: [],
		directus_users: [],
		...structuredCloneSafe(seed),
	};
	const notifications: Row[] = [];
	const writes = { create: 0, update: 0, delete: 0 };
	let idCounter = 1000;
	const genId = () => `gen_${idCounter++}`;

	async function request(descriptor: any): Promise<any> {
		const d = descriptor;
		if (!d || !d.__cmd) throw new Error(`fake-directus: not a mocked command: ${JSON.stringify(d)}`);
		const coll = (name: string) => (db[name] ||= []);

		switch (d.__cmd) {
			case 'readItems': {
				const rows = coll(d.collection).filter((r) => matches(r, d.query?.filter));
				return applyLimit(rows, d.query?.limit).map((r) => ({ ...r }));
			}
			case 'readItem': {
				const row = coll(d.collection).find((r) => String(r.id) === String(d.id));
				return row ? { ...row } : null;
			}
			case 'createItem': {
				const row = { id: genId(), ...d.data };
				coll(d.collection).push(row);
				writes.create++;
				return { ...row };
			}
			case 'updateItem': {
				const row = coll(d.collection).find((r) => String(r.id) === String(d.id));
				if (!row) throw new Error(`fake-directus: updateItem missing ${d.collection}/${d.id}`);
				Object.assign(row, d.data);
				writes.update++;
				return { ...row };
			}
			case 'updateItems': {
				const rows = coll(d.collection).filter((r) => (d.ids as string[]).map(String).includes(String(r.id)));
				for (const row of rows) Object.assign(row, d.data);
				writes.update += rows.length;
				return rows.map((r) => ({ ...r }));
			}
			case 'deleteItem': {
				const arr = coll(d.collection);
				const idx = arr.findIndex((r) => String(r.id) === String(d.id));
				if (idx >= 0) arr.splice(idx, 1);
				writes.delete++;
				return null;
			}
			case 'createNotification': {
				notifications.push({ ...d.data });
				return { id: genId(), ...d.data };
			}
			case 'aggregate': {
				// Minimal support: count '*' with optional groupBy.
				const rows = coll(d.collection).filter((r) => matches(r, d.opts?.query?.filter));
				return [{ count: rows.length }];
			}
			default:
				throw new Error(`fake-directus: unhandled command ${d.__cmd}`);
		}
	}

	return { db, request, notifications, writes };
}

function structuredCloneSafe<T>(v: T): T {
	return JSON.parse(JSON.stringify(v ?? {}));
}
