/**
 * useOrgBrand — the current organization's visual identity, for surfaces that
 * should read as the AGENCY rather than as Earnest (primarily the client
 * portal).
 *
 * Reads from `currentOrg` (already hydrated by useOrganization with `logo`,
 * `brand_color`, `whitelabel`, `name` — including for portal-only users, whose
 * org is fetched as an "extra org" with the full field set). No extra network
 * call. For unauthenticated surfaces (e.g. the invite-accept page) fetch the
 * brand server-side instead — this composable needs a resolved session.
 *
 * Deliberately scoped: `brandStyle` exposes a `--org-brand` CSS var for accents
 * and CTAs. It does NOT rebase the global palette (--primary et al.) — arbitrary
 * client brand colors can fail contrast against the app's tokens, and the
 * palette system (useAppPalette) is the owner of the base theme. Brand color is
 * an accent layered on top, not a theme takeover.
 */
import { isEarnestBrandingHidden } from '~~/shared/branding';

export function useOrgBrand() {
	const { currentOrg } = useOrganization();
	const config = useRuntimeConfig();

	const orgName = computed<string>(() => (currentOrg.value as any)?.name || 'Earnest');

	const brandColor = computed<string | null>(() => (currentOrg.value as any)?.brand_color || null);

	const logoUrl = computed<string | null>(() => {
		const logo = (currentOrg.value as any)?.logo;
		const id = typeof logo === 'object' ? logo?.id : logo;
		if (!id) return null;
		return `${config.public.directusUrl}/assets/${id}?width=320&quality=90`;
	});

	// Whitelabel — hides the "Powered by Earnest" mark. Gated on the single
	// source of truth (toggle ON *and* entitled: enterprise or white_label
	// add-on), so the portal agrees with documents/emails/invite/booking.
	const whitelabel = computed<boolean>(() =>
		isEarnestBrandingHidden(currentOrg.value as any),
	);

	// True when there's something org-specific to show — otherwise callers fall
	// back to Earnest chrome.
	const hasBranding = computed<boolean>(() => !!logoUrl.value || !!brandColor.value);

	// CSS custom properties for brand-accented surfaces. `--org-brand` defaults
	// to the theme primary so consumers can use it unconditionally.
	const brandStyle = computed<Record<string, string>>(() =>
		brandColor.value
			? {
					'--org-brand': brandColor.value,
					'--org-brand-soft': `${brandColor.value}1f`,
					'--org-brand-ring': `${brandColor.value}33`,
				}
			: {
					'--org-brand': 'hsl(var(--primary))',
					'--org-brand-soft': 'hsl(var(--primary) / 0.12)',
					'--org-brand-ring': 'hsl(var(--primary) / 0.2)',
				},
	);

	return {
		orgName,
		brandColor,
		logoUrl,
		whitelabel,
		hasBranding,
		brandStyle,
	};
}
