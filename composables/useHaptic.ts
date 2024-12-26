export function useHaptic() {
	const triggerHaptic = (pattern: number | number[] = 200) => {
		if (navigator.vibrate) {
			navigator.vibrate(pattern);
		} else {
			console.warn('Haptic feedback not supported.');
		}
	};

	return { triggerHaptic };
}
