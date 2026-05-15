/**
 * useAppPalette — per-user palette selection for the apps shell.
 *
 * Mirrors `useAppsMode`'s persistence pattern: a module-level ref is the
 * client-side source of truth, hydrated once from `/api/directus/users/me`
 * on first read. Persists to `directus_users.app_palette` so the choice
 * survives sessions and syncs across devices.
 *
 * The available palettes (id + label + hint + colours) live in
 * `APP_PALETTES` over in `useAppAccent.ts`. Adding a new palette is a
 * single-file change there — this composable and the picker pick it up
 * automatically.
 *
 * Legacy aliasing: if a user's stored id has been renamed (e.g. the old
 * `royal` → `gradientBlues`), `resolvePaletteId` returns the new id so
 * their selection survives. They also get a best-effort PATCH to clean
 * the stored value, so future reads skip the alias lookup.
 */
import {
	APP_PALETTE_IDS,
	APP_PALETTE_ALIASES,
	resolvePaletteId,
	type AppPaletteId,
} from '~/composables/useAppAccent';

export type { AppPaletteId };

const localPalette = ref<AppPaletteId | null>(null);
let hydrationPromise: Promise<void> | null = null;

async function hydrateFromServer(updateMe?: (patch: any) => Promise<unknown>) {
	if (hydrationPromise) return hydrationPromise;
	hydrationPromise = (async () => {
		try {
			const me = (await $fetch('/api/directus/users/me', {
				method: 'GET',
				params: { fields: 'app_palette' },
			})) as Record<string, any>;
			const raw = me?.app_palette;
			const resolved = resolvePaletteId(raw);
			localPalette.value = resolved;

			// Best-effort migration of legacy ids — write the canonical value
			// back so future hydrates skip the alias map. Fails silently on
			// read-only accounts (e.g. demo users); the local override keeps
			// the resolved id active for this session either way.
			if (typeof raw === 'string' && APP_PALETTE_ALIASES[raw] && updateMe) {
				updateMe({ app_palette: resolved }).catch(() => undefined);
			}
		} catch {
			localPalette.value = 'seaMist';
		}
	})();
	return hydrationPromise;
}

export function useAppPalette() {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();

	if (import.meta.client && localPalette.value === null) {
		hydrateFromServer(updateMe);
	}

	const palette = computed<AppPaletteId>(() => {
		if (localPalette.value !== null) return localPalette.value;
		return resolvePaletteId((user.value as any)?.app_palette);
	});

	async function setPalette(next: AppPaletteId): Promise<void> {
		if (!APP_PALETTE_IDS.includes(next)) return;
		if (palette.value === next) return;
		// Flip locally first so the UI reacts immediately, even if the
		// server save fails (mirrors useAppsMode's best-effort persistence).
		localPalette.value = next;
		try {
			await updateMe({ app_palette: next } as any);
		} catch (err) {
			console.warn('[useAppPalette] app_palette persist failed; keeping local override', err);
			throw err;
		}
	}

	return { palette, setPalette, paletteIds: APP_PALETTE_IDS };
}
