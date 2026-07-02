/**
 * useAppPalette — per-user palette selection for the apps shell.
 *
 * Shared state lives in Nuxt `useState` (not a module-level `ref`) so every
 * consumer — the `app-palette.client` plugin, `useAppAccent` (rail chips +
 * header), the settings panel — reads the *same* reactive value. A bare
 * module ref was load-bearing-by-accident: `useAppAccent.ts` and this file
 * import each other (circular), which let the bundler hand different callers
 * different module instances, each with its own `localPalette`. The plugin
 * would hydrate one instance to the user's palette while the rail read
 * another stuck on the default — so the chips rendered Sea Mist gradients
 * while `<html data-chip-mode>` said Neutral, and Neutral's same-hue glyphs
 * vanished into their chips. `useState` is keyed globally, so duplicate
 * module instances all resolve to one store. It's also SSR-safe: the value
 * resolved on the server serialises into the payload and hydrates without a
 * mismatch.
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
	DEFAULT_APP_PALETTE,
	applyPaletteToDocument,
	resolvePaletteId,
	type AppPaletteId,
} from '~/composables/useAppAccent';

export type { AppPaletteId };

/** Dedup guard for the one-shot server hydrate. Module-level is fine even if
 *  the module is instantiated twice — the fetch is idempotent and writes to
 *  the shared `useState` store, so a double-run just resolves to the same
 *  value. */
let hydrationPromise: Promise<void> | null = null;

const GLASS_STORAGE_KEY = 'earnest.appGlassChrome';
const TINT_STORAGE_KEY = 'earnest.appPaletteTint';

/**
 * Glass-chrome toggle — orthogonal to the palette choice. When ON, every
 * palette renders chips + primary buttons as frosted-grey surfaces with
 * the palette's accent doing the actual colour work (icons, button text).
 * Decouples "surface treatment" from "accent hue" so users can wear
 * Sea Mist as either a vibrant gradient or a calm frosted look.
 *
 * Persisted to localStorage rather than Directus — it's a chrome
 * preference, not a brand-critical field, and we'd rather avoid a
 * schema migration for a UI toggle. Promote to a Directus field if
 * cross-device sync becomes important.
 */
function hydrateGlassFromStorage(localGlass: Ref<boolean | null>) {
	if (typeof window === 'undefined' || localGlass.value !== null) return;
	try {
		localGlass.value = window.localStorage.getItem(GLASS_STORAGE_KEY) === 'true';
	} catch {
		localGlass.value = false;
	}
}

/**
 * Palette-tint toggle — paints the floating AppRail (and other glass
 * surfaces) with a multi-stop linear gradient sampled from the active
 * palette's per-app accents, over a darkened plinth in dark mode. Pairs
 * with `glassChrome` but is independent: a user can wear the rail as
 * grey-frosted or palette-tinted regardless of the chip-mode setting.
 *
 * Same persistence shape as glassChrome (localStorage, not Directus) —
 * cheap chrome preference, not worth a schema migration. Defaults to
 * ON because the feature is the whole point of the toggle — users who
 * dislike it can disable from the rail settings panel.
 */
function hydrateTintFromStorage(localTint: Ref<boolean | null>) {
	if (typeof window === 'undefined' || localTint.value !== null) return;
	try {
		const stored = window.localStorage.getItem(TINT_STORAGE_KEY);
		// Default to ON when no preference has been saved yet — first-load
		// users see the tint and discover the toggle.
		localTint.value = stored === null ? true : stored === 'true';
	} catch {
		localTint.value = true;
	}
}

async function hydrateFromServer(
	localPalette: Ref<AppPaletteId | null>,
	updateMe?: (patch: any) => Promise<unknown>,
) {
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
			applyPaletteToDocument(resolved);

			// Best-effort migration of legacy ids — write the canonical value
			// back so future hydrates skip the alias map. Fails silently on
			// read-only accounts (e.g. demo users); the local override keeps
			// the resolved id active for this session either way.
			if (typeof raw === 'string' && APP_PALETTE_ALIASES[raw] && updateMe) {
				updateMe({ app_palette: resolved }).catch(() => undefined);
			}
		} catch {
			localPalette.value = DEFAULT_APP_PALETTE;
			applyPaletteToDocument(DEFAULT_APP_PALETTE);
		}
	})();
	return hydrationPromise;
}

export function useAppPalette() {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();

	// Shared, app-wide state — `useState` guarantees a single store keyed by
	// name even if this module is instantiated more than once (circular
	// import with useAppAccent). Without this, palette/glass/tint could
	// diverge between the plugin and the rail. See the file-level note.
	const localPalette = useState<AppPaletteId | null>('app-palette', () => null);
	const localGlass = useState<boolean | null>('app-glass-chrome', () => null);
	const localTint = useState<boolean | null>('app-palette-tint', () => null);

	if (import.meta.client && localPalette.value === null) {
		hydrateFromServer(localPalette, updateMe);
	}
	if (import.meta.client) hydrateGlassFromStorage(localGlass);
	if (import.meta.client) hydrateTintFromStorage(localTint);

	const palette = computed<AppPaletteId>(() => {
		if (localPalette.value !== null) return localPalette.value;
		return resolvePaletteId((user.value as any)?.app_palette);
	});

	const glassChrome = computed<boolean>(() => localGlass.value ?? false);
	const paletteTint = computed<boolean>(() => localTint.value ?? true);

	async function setPalette(next: AppPaletteId): Promise<void> {
		if (!APP_PALETTE_IDS.includes(next)) return;
		if (palette.value === next) return;
		// Flip locally first so the UI reacts immediately, even if the
		// server save fails (mirrors useAppsMode's best-effort persistence).
		localPalette.value = next;
		applyPaletteToDocument(next);
		try {
			await updateMe({ app_palette: next } as any);
		} catch (err) {
			console.warn('[useAppPalette] app_palette persist failed; keeping local override', err);
			throw err;
		}
	}

	function setGlassChrome(next: boolean): void {
		if (localGlass.value === next) return;
		localGlass.value = next;
		if (typeof window !== 'undefined') {
			try {
				window.localStorage.setItem(GLASS_STORAGE_KEY, String(next));
			} catch {
				// Quota / private-mode — keep the local override so the UI
				// still reflects the user's intent for this session.
			}
		}
	}

	function setPaletteTint(next: boolean): void {
		if (localTint.value === next) return;
		localTint.value = next;
		if (typeof window !== 'undefined') {
			try {
				window.localStorage.setItem(TINT_STORAGE_KEY, String(next));
			} catch {
				// Quota / private-mode — local override stays for the session.
			}
		}
	}

	return { palette, setPalette, paletteIds: APP_PALETTE_IDS, glassChrome, setGlassChrome, paletteTint, setPaletteTint };
}
