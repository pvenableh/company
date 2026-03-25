// composables/useABTest.ts
/**
 * A/B test variant composable.
 *
 * Reads the assigned variant from the cookie (set by server middleware).
 * Provides helper to track conversion events to Google Analytics.
 *
 * Usage:
 *   const { variant, isVariantB, trackEvent } = useABTest()
 *   trackEvent('signup_started')  // sends GA event with variant dimension
 */

export function useABTest() {
	const variant = useCookie<string>('earnest_ab', {
		default: () => 'a',
		maxAge: 60 * 60 * 24 * 30,
		path: '/',
		sameSite: 'lax',
	});

	const isVariantA = computed(() => variant.value === 'a');
	const isVariantB = computed(() => variant.value === 'b');

	/**
	 * Track an A/B test event to Google Analytics.
	 * Events include the variant as a custom parameter so you can
	 * segment conversions by variant in GA reports.
	 *
	 * Common events:
	 *   'sellsheet_view'      — page loaded
	 *   'cta_click'           — clicked a CTA button
	 *   'signup_started'      — clicked register
	 *   'signup_completed'    — registration finished
	 *   'pricing_viewed'      — scrolled to pricing section
	 */
	function trackEvent(eventName: string, extra?: Record<string, any>) {
		if (!import.meta.client) return;

		const gtag = (window as any).gtag;
		if (typeof gtag === 'function') {
			gtag('event', eventName, {
				ab_variant: variant.value,
				event_category: 'ab_test',
				...extra,
			});
		}
	}

	/**
	 * Track a page view with variant context.
	 * Call once when the SellSheet mounts.
	 */
	function trackPageView(pageName: string = 'sellsheet') {
		trackEvent(`${pageName}_view`);
	}

	return {
		variant: readonly(variant),
		isVariantA,
		isVariantB,
		trackEvent,
		trackPageView,
	};
}
