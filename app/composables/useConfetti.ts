/**
 * useConfetti - Task completion celebration
 *
 * Colors are sampled from the active theme's CSS tokens at burst time
 * (--primary, the app accent hue, --muted-foreground), so confetti always
 * matches the selected palette across themes and light/dark mode.
 * canvas-confetti only accepts hex colors, so tokens are converted here.
 */

const FALLBACK_COLORS = ['#1f1f1f', '#4d7fd6', '#a3bced', '#737373'];

function hslToHex(h: number, s: number, l: number): string {
	const sat = s / 100;
	const lig = l / 100;
	const a = sat * Math.min(lig, 1 - lig);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const c = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(255 * c)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

/** Parse a shadcn-style token triplet like "220 70% 48%" into h/s/l numbers. */
function parseHslTriplet(raw: string): [number, number, number] | null {
	const m = raw.trim().match(/^([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%$/);
	if (!m) return null;
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Theme-matched confetti palette, sampled from the live CSS tokens. */
export function getConfettiColors(): string[] {
	if (!import.meta.client) return FALLBACK_COLORS;
	const styles = getComputedStyle(document.documentElement);
	const colors: string[] = [];

	const primary = parseHslTriplet(styles.getPropertyValue('--primary'));
	if (primary) colors.push(hslToHex(...primary));

	// The per-app accent hue that tints the liquid-glass surfaces.
	const accentH = Number.parseFloat(styles.getPropertyValue('--app-accent-h')) || 220;
	const accentS = Number.parseFloat(styles.getPropertyValue('--app-accent-s')) || 70;
	colors.push(hslToHex(accentH, accentS, 60), hslToHex(accentH, accentS, 78));

	const mutedFg = parseHslTriplet(styles.getPropertyValue('--muted-foreground'));
	if (mutedFg) colors.push(hslToHex(...mutedFg));

	return colors.length ? colors : FALLBACK_COLORS;
}

export function useConfetti() {
	const celebrate = async () => {
		if (import.meta.client) {
			const confetti = await import('canvas-confetti');
			confetti.default({
				particleCount: 100,
				spread: 70,
				origin: { y: 0.6 },
				colors: getConfettiColors(),
				disableForReducedMotion: true,
			});
		}
	};

	return { celebrate, getConfettiColors };
}
