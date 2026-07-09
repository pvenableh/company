/**
 * useAppPalette — the org's brand accent palette for the apps shell.
 *
 * The accent palette is an ORG-LEVEL brand setting (`organizations.app_palette`),
 * NOT a per-user preference: an admin picks it once and it re-skins the semantic
 * accent tokens (`--info` / `--status-*` / `--tag-*` / `--app-*`) for every member
 * of the org AND the client portal. (It used to live on `directus_users.app_palette`
 * — that column is now legacy/unread.) See [[project_universal_ux_color_system]].
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

export function useAppPalette() {
	const { currentOrg, fetchOrganizationDetails } = useOrganization();
	const orgItems = useDirectusItems('organizations');

	// Shared, app-wide state — `useState` keeps one store even if this module
	// is instantiated twice (circular import with useAppAccent).
	const localPalette = useState<AppPaletteId | null>('app-palette', () => null);
	const localGlass = useState<boolean | null>('app-glass-chrome', () => null);
	const localTint = useState<boolean | null>('app-palette-tint', () => null);

	if (import.meta.client) hydrateGlassFromStorage(localGlass);
	if (import.meta.client) hydrateTintFromStorage(localTint);

	const palette = computed<AppPaletteId>(() => {
		// Optimistic override wins until the org row refetches with the saved value.
		if (localPalette.value !== null) return localPalette.value;
		return resolvePaletteId((currentOrg.value as any)?.app_palette);
	});

	const glassChrome = computed<boolean>(() => localGlass.value ?? false);
	const paletteTint = computed<boolean>(() => localTint.value ?? true);

	/**
	 * Set the org's brand accent. Writing re-skins every member of the org +
	 * the client portal, so gate the calling UI to admins/owners — the write
	 * itself will 403 for non-privileged users via Directus org perms.
	 */
	async function setPalette(next: AppPaletteId): Promise<void> {
		if (!APP_PALETTE_IDS.includes(next)) return;
		if (palette.value === next) return;
		const orgId = (currentOrg.value as any)?.id;
		// Flip locally first so the picker reacts immediately, even before the
		// org row refetches (mirrors useAppsMode's best-effort persistence).
		localPalette.value = next;
		applyPaletteToDocument(next);
		if (!orgId) return;
		try {
			await orgItems.update(orgId, { app_palette: next });
			await fetchOrganizationDetails();
			// Authoritative org value now matches — drop the optimistic override.
			localPalette.value = null;
		} catch (err) {
			console.warn('[useAppPalette] org app_palette persist failed; keeping local override', err);
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
