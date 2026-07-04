/**
 * Rasterize the Earnest logomark (app/assets/icons/earnest/logo.svg) to a
 * transparent PNG for email headers. SVG doesn't render in most email clients
 * (Gmail/Outlook/Yahoo strip it), so emails need a raster logo.
 *
 * Output: public/email/earnest-logo.png — served at {appUrl}/email/earnest-logo.png
 * and referenced by server/emails/_header.mjml (via `earnestLogoUrl`).
 *
 * Re-run after a brand change:  pnpm tsx scripts/generate-email-logo.ts
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';

async function main() {
	// The E path uses fill="currentColor" — pin it to Earnest ink for the raster.
	const svg = readFileSync('app/assets/icons/earnest/logo.svg', 'utf8').replace(/currentColor/g, '#141210');

	mkdirSync('public/email', { recursive: true });

	// 240px = ~40px display at 6x for crisp retina rendering.
	await sharp(Buffer.from(svg), { density: 384 })
		.resize(240, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile('public/email/earnest-logo.png');

	console.log('✓ wrote public/email/earnest-logo.png');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
