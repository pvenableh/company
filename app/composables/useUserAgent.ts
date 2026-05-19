/**
 * Lightweight platform / install-mode detection. Client-only — all fields
 * default to `false` on the server so SSR is stable.
 *
 * The only consumer today is the CardDesk install-promo banner; this stays
 * intentionally tiny instead of pulling in a UA-parsing dep.
 */
export interface UserAgentInfo {
	isIOS: boolean;
	isAndroid: boolean;
	/** Any Chromium-based engine (Chrome, Edge, Brave, Opera) — used to
	 *  decide whether the "Install as app" CTA is meaningful. */
	isChromium: boolean;
	/** Running inside an installed PWA (any platform). */
	isStandalone: boolean;
	/** A platform that can actually accept a home-screen install of the
	 *  CardDesk PWA — iOS Safari OR Chromium on Android/desktop. */
	canInstallPwa: boolean;
}

const SERVER_FALLBACK: UserAgentInfo = {
	isIOS: false,
	isAndroid: false,
	isChromium: false,
	isStandalone: false,
	canInstallPwa: false,
};

export function useUserAgent(): UserAgentInfo {
	if (import.meta.server || typeof window === 'undefined') {
		return SERVER_FALLBACK;
	}

	const ua = window.navigator.userAgent || '';

	// iPadOS 13+ identifies as Mac with touch — sniff both.
	const isIOS =
		/iPad|iPhone|iPod/.test(ua) ||
		(ua.includes('Macintosh') && 'ontouchend' in document);
	const isAndroid = /Android/.test(ua);
	// Firefox/Safari ship distinct engines; Chromium UAs include "Chrome/" but
	// not "Edg/" excluded — Edge IS Chromium and accepts beforeinstallprompt.
	const isChromium =
		/Chrome\//.test(ua) || /Edg\//.test(ua) || /OPR\//.test(ua);

	const isStandalone =
		window.matchMedia?.('(display-mode: standalone)').matches ||
		(window.navigator as Navigator & { standalone?: boolean }).standalone === true;

	const canInstallPwa = (isIOS && !isStandalone) || ((isAndroid || isChromium) && !isStandalone);

	return { isIOS, isAndroid, isChromium, isStandalone, canInstallPwa };
}
