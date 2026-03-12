/**
 * iOS-style haptic feedback patterns.
 *
 * On devices with vibration support these map to real haptics.
 * On iOS Safari PWA they trigger the Taptic Engine via short vibrations.
 */

/** Predefined iOS-like haptic intensities (ms) */
const PATTERNS = {
	/** Lightest tap — tab switch, toggle */
	light: 10,
	/** Standard interaction — button press */
	medium: 25,
	/** Heavier feedback — destructive action confirmation */
	heavy: 50,
	/** Success pattern */
	success: [10, 30, 10],
	/** Warning double-tap */
	warning: [15, 40, 15],
	/** Error triple-tap */
	error: [10, 20, 10, 20, 10],
} as const;

type HapticStyle = keyof typeof PATTERNS;

export function useHaptic() {
	const triggerHaptic = (patternOrStyle: number | number[] | HapticStyle = 'light') => {
		if (typeof window === 'undefined') return;
		if (!navigator.vibrate) return;

		if (typeof patternOrStyle === 'string') {
			const p = PATTERNS[patternOrStyle];
			navigator.vibrate(p);
		} else {
			navigator.vibrate(patternOrStyle);
		}
	};

	return { triggerHaptic };
}
