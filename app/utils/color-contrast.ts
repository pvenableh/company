/**
 * Pick a foreground colour that stays legible on top of an arbitrary
 * background swatch. Used wherever user-picked colour (service templates,
 * lead stages, ai_tags, etc.) is rendered as a chip background with text
 * on top — guarantees readable type regardless of the user's choice.
 *
 * Algorithm: relative luminance per WCAG (sRGB → linear → weighted sum),
 * compared to a 0.5 midpoint. Tuned slightly cooler than YIQ for pastels —
 * very pale chip bgs reliably get the dark foreground.
 *
 * Accepts a CSS hex string (#rgb, #rrggbb, with/without #). Returns one of
 * the two foreground tokens we ship for chips:
 *   - 'rgb(20, 18, 16)'   — near-black, matches `--foreground` in light mode
 *   - 'rgb(255, 255, 255)' — pure white
 *
 * Returns the dark fg when the hex is invalid so an empty/null colour
 * doesn't render invisibly.
 */

const DARK_FG = 'rgb(20, 18, 16)';
const LIGHT_FG = 'rgb(255, 255, 255)';

function parseHex(input: string | null | undefined): { r: number; g: number; b: number } | null {
	if (!input) return null;
	const hex = input.trim().replace(/^#/, '');
	let r: number, g: number, b: number;
	if (hex.length === 3) {
		r = parseInt(hex[0]! + hex[0], 16);
		g = parseInt(hex[1]! + hex[1], 16);
		b = parseInt(hex[2]! + hex[2], 16);
	} else if (hex.length === 6) {
		r = parseInt(hex.slice(0, 2), 16);
		g = parseInt(hex.slice(2, 4), 16);
		b = parseInt(hex.slice(4, 6), 16);
	} else {
		return null;
	}
	if ([r, g, b].some(Number.isNaN)) return null;
	return { r, g, b };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * HSL → RGB (each 0-255). h ∈ [0,360], s/l ∈ [0,100]. Used so the same
 * luminance pass can score palette-derived HSL backgrounds (the
 * `--app-{id}` vars are HSL triples) without round-tripping through a
 * CSS string.
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	const sn = s / 100;
	const ln = l / 100;
	const c = (1 - Math.abs(2 * ln - 1)) * sn;
	const hp = (h % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r1 = 0, g1 = 0, b1 = 0;
	if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
	else if (hp < 2) { r1 = x; g1 = c; }
	else if (hp < 3) { g1 = c; b1 = x; }
	else if (hp < 4) { g1 = x; b1 = c; }
	else if (hp < 5) { r1 = x; b1 = c; }
	else { r1 = c; b1 = x; }
	const m = ln - c / 2;
	return {
		r: Math.round((r1 + m) * 255),
		g: Math.round((g1 + m) * 255),
		b: Math.round((b1 + m) * 255),
	};
}

export function legibleTextOn(hex: string | null | undefined): string {
	const rgb = parseHex(hex);
	if (!rgb) return DARK_FG;
	return relativeLuminance(rgb) > 0.5 ? DARK_FG : LIGHT_FG;
}

export function legibleTextOnHsl(h: number, s: number, l: number): string {
	return relativeLuminance(hslToRgb(h, s, l)) > 0.5 ? DARK_FG : LIGHT_FG;
}
