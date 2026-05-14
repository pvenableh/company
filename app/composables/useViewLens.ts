/**
 * useViewLens — per-user "For me / For org" lens for the Command Center.
 *
 * Stage 2 of the "Me" lens initiative. Same persistence pattern as
 * `useAppPalette`: a module-level ref is the client-side source of truth,
 * hydrated once from `/api/directus/users/me` on first read. Persists to
 * `directus_users.view_lens` so the choice survives sessions and syncs
 * across devices.
 *
 * Consumers:
 *  - `/` (Command Center) — re-ranks band order: 'me' → YOU/US/REFERENCE,
 *    'org' → US/YOU/REFERENCE. Same content, different emphasis.
 *  - `/goals` — when no explicit `?scope=` URL param is present, default
 *    scope filter from `lens.value === 'me' ? 'user' : 'all'`.
 *
 * Tolerates a missing `view_lens` field on the server (older orgs that
 * haven't run `scripts/setup-view-lens-field.ts` yet) — defaults to 'me'.
 */
export type ViewLens = 'me' | 'org';

const LENS_VALUES: readonly ViewLens[] = ['me', 'org'] as const;

function isLens(v: unknown): v is ViewLens {
	return typeof v === 'string' && (LENS_VALUES as readonly string[]).includes(v);
}

const localLens = ref<ViewLens | null>(null);
let hydrationPromise: Promise<void> | null = null;

async function hydrateFromServer() {
	if (hydrationPromise) return hydrationPromise;
	hydrationPromise = (async () => {
		try {
			const me = (await $fetch('/api/directus/users/me', {
				method: 'GET',
				params: { fields: 'view_lens' },
			})) as Record<string, any>;
			localLens.value = isLens(me?.view_lens) ? me.view_lens : 'me';
		} catch {
			localLens.value = 'me';
		}
	})();
	return hydrationPromise;
}

export function useViewLens() {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();

	if (import.meta.client && localLens.value === null) {
		hydrateFromServer();
	}

	const lens = computed<ViewLens>(() => {
		if (localLens.value !== null) return localLens.value;
		const raw = (user.value as any)?.view_lens;
		return isLens(raw) ? raw : 'me';
	});

	async function setLens(next: ViewLens): Promise<void> {
		if (!LENS_VALUES.includes(next)) return;
		if (lens.value === next) return;
		// Flip locally first so the UI reacts immediately, even if the server
		// save fails (mirrors useAppPalette's best-effort persistence).
		localLens.value = next;
		try {
			await updateMe({ view_lens: next } as any);
		} catch (err) {
			console.warn('[useViewLens] view_lens persist failed; keeping local override', err);
			throw err;
		}
	}

	function toggle(): Promise<void> {
		return setLens(lens.value === 'me' ? 'org' : 'me');
	}

	return { lens, setLens, toggle, lensValues: LENS_VALUES };
}
