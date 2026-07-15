/**
 * useAppPalette — the accent palette for the apps shell.
 *
 * 2026-07-15 (monetization ladder, rung 1): the palette is a PER-USER choice.
 * Resolution order: optimistic local flip → the user's own
 * `directus_users.app_palette` (the once-legacy column, now read again) →
 * the org's `organizations.app_palette` as fallback (and as the value
 * client-portal visitors get, since their user rows carry no palette).
 * `setPalette` writes to the CURRENT USER via `/api/directus/users/me` —
 * the field is granted by `scripts/setup-user-pref-perms.ts`. The org
 * column remains the org-level/client-facing default (future "Brand
 * Light" lives there). See [[project_universal_ux_color_system]].
 *
 * Shared state lives in Nuxt `useState` (not a module-level `ref`) so every
 * consumer — the `app-palette.client` plugin, `useAppAccent` (rail chips +
 * header), the org settings picker — reads the *same* reactive value. A bare
 * module ref was load-bearing-by-accident: `useAppAccent.ts` and this file
 * import each other (circular), which let the bundler hand different callers
 * different module instances, each with its own `localPalette`. `useState` is
 * keyed globally, so duplicate module instances all resolve to one store.
 *
 * `localPalette` is only an OPTIMISTIC override so the picker reacts the instant
 * an admin selects a new palette; the authoritative value is the org row's
 * `app_palette`, resolved via `useOrganization().currentOrg` and cleared back to
 * null once the org refetch confirms the save.
 *
 * `glassChrome` + `paletteTint` stay PER-USER (localStorage) — they're chrome
 * preferences ("how the surface looks to me"), orthogonal to the brand accent.
 *
 * The available palettes (id + label + hint + colours) live in `APP_PALETTES`
 * over in `useAppAccent.ts`; adding one is a single-file change there.
 */
import {
	APP_PALETTE_IDS,
	applyPaletteToDocument,
	resolvePaletteId,
	type AppPaletteId,
} from '~/composables/useAppAccent';

export type { AppPaletteId };

const GLASS_STORAGE_KEY = 'earnest.appGlassChrome';
const TINT_STORAGE_KEY = 'earnest.appPaletteTint';

/**
 * Glass-chrome toggle — orthogonal to the palette choice. When ON, every
 * palette renders chips + primary buttons as frosted-grey surfaces with
 * the palette's accent doing the actual colour work (icons, button text).
 * Decouples "surface treatment" from "accent hue".
 *
 * Persisted to localStorage rather than Directus — it's a per-user chrome
 * preference, not a brand-critical field.
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
 * Palette-tint toggle — paints the floating AppRail (and other glass surfaces)
 * with a multi-stop gradient sampled from the active palette's per-app accents.
 * Per-user localStorage, defaults ON so first-load users discover the toggle.
 */
function hydrateTintFromStorage(localTint: Ref<boolean | null>) {
	if (typeof window === 'undefined' || localTint.value !== null) return;
	try {
		const stored = window.localStorage.getItem(TINT_STORAGE_KEY);
		localTint.value = stored === null ? true : stored === 'true';
	} catch {
		localTint.value = true;
	}
}

/**
 * Load the current user's own `app_palette` once per session. `'unset'`
 * means "loaded, user has no personal pick" → fall through to the org.
 * Errors (no session, portal users on a different auth shape) also land
 * on `'unset'` so the org fallback always renders something sane.
 */
function hydrateUserPalette(
	userPalette: Ref<AppPaletteId | 'unset' | null>,
	loading: Ref<boolean>,
	readMe: (q?: Record<string, any>) => Promise<any>,
) {
	if (userPalette.value !== null || loading.value) return;
	loading.value = true;
	readMe({ fields: ['app_palette'] })
		.then((me: any) => {
			const raw = me?.app_palette;
			userPalette.value = typeof raw === 'string' && raw ? resolvePaletteId(raw) : 'unset';
		})
		.catch(() => {
			userPalette.value = 'unset';
		});
}

export function useAppPalette() {
	const { currentOrg } = useOrganization();
	const { readMe, updateMe } = useDirectusUsers();

	// Shared, app-wide state — `useState` keeps one store even if this module
	// is instantiated twice (circular import with useAppAccent).
	const localPalette = useState<AppPaletteId | null>('app-palette', () => null);
	const userPalette = useState<AppPaletteId | 'unset' | null>('user-app-palette', () => null);
	const userPaletteLoading = useState<boolean>('user-app-palette-loading', () => false);
	const localGlass = useState<boolean | null>('app-glass-chrome', () => null);
	const localTint = useState<boolean | null>('app-palette-tint', () => null);

	if (import.meta.client) hydrateGlassFromStorage(localGlass);
	if (import.meta.client) hydrateTintFromStorage(localTint);
	if (import.meta.client) hydrateUserPalette(userPalette, userPaletteLoading, readMe);

	const palette = computed<AppPaletteId>(() => {
		// Optimistic override wins until the user row persists the new value.
		if (localPalette.value !== null) return localPalette.value;
		// Personal pick beats the org default (rung 1: user's choice).
		if (userPalette.value !== null && userPalette.value !== 'unset') return userPalette.value;
		return resolvePaletteId((currentOrg.value as any)?.app_palette);
	});

	const glassChrome = computed<boolean>(() => localGlass.value ?? false);
	const paletteTint = computed<boolean>(() => localTint.value ?? true);

	/**
	 * Set the CURRENT USER's palette (personal chrome preference). The write
	 * goes to `directus_users.app_palette` via `/api/directus/users/me`;
	 * client-facing surfaces keep following the org column.
	 */
	async function setPalette(next: AppPaletteId): Promise<void> {
		if (!APP_PALETTE_IDS.includes(next)) return;
		if (palette.value === next) return;
		// Flip locally first so the picker reacts immediately, even before the
		// user row persists (mirrors useAppsMode's best-effort persistence).
		localPalette.value = next;
		applyPaletteToDocument(next);
		try {
			await updateMe({ app_palette: next });
			// Authoritative user value now matches — drop the optimistic override.
			userPalette.value = next;
			localPalette.value = null;
		} catch (err) {
			console.warn('[useAppPalette] user app_palette persist failed; keeping local override', err);
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
				// Quota / private-mode — keep the local override for this session.
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
