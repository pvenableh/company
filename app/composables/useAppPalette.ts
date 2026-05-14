/**
 * useAppPalette — per-user palette selection for the apps shell.
 *
 * Mirrors `useAppsMode`'s persistence pattern: a module-level ref is the
 * client-side source of truth, hydrated once from `/api/directus/users/me`
 * on first read. Persists to `directus_users.app_palette` so the choice
 * survives sessions and syncs across devices.
 *
 * Three palettes ship today:
 *   - default  → the original brand colours (Apple iWork pattern)
 *   - oceanic  → green-to-deep-blue, lime/emerald/teal/baltic/yale
 *   - royal    → indigo-violet gradient
 *
 * Add a new palette by:
 *   1. Adding an entry to `APP_PALETTES` in useAppAccent.ts (per-app HSL)
 *   2. Adding the id to `PALETTE_IDS` below + a label/swatch in the picker
 */
export type AppPaletteId = 'default' | 'oceanic' | 'royal';

const PALETTE_IDS: AppPaletteId[] = ['default', 'oceanic', 'royal'];

const localPalette = ref<AppPaletteId | null>(null);
let hydrationPromise: Promise<void> | null = null;

async function hydrateFromServer() {
	if (hydrationPromise) return hydrationPromise;
	hydrationPromise = (async () => {
		try {
			const me = (await $fetch('/api/directus/users/me', {
				method: 'GET',
				params: { fields: 'app_palette' },
			})) as Record<string, any>;
			const raw = me?.app_palette as AppPaletteId | undefined;
			localPalette.value = raw && PALETTE_IDS.includes(raw) ? raw : 'default';
		} catch {
			localPalette.value = 'default';
		}
	})();
	return hydrationPromise;
}

export function useAppPalette() {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();

	if (import.meta.client && localPalette.value === null) {
		hydrateFromServer();
	}

	const palette = computed<AppPaletteId>(() => {
		if (localPalette.value !== null) return localPalette.value;
		const raw = (user.value as any)?.app_palette as AppPaletteId | undefined;
		return raw && PALETTE_IDS.includes(raw) ? raw : 'default';
	});

	async function setPalette(next: AppPaletteId): Promise<void> {
		if (!PALETTE_IDS.includes(next)) return;
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

	return { palette, setPalette, paletteIds: PALETTE_IDS };
}
