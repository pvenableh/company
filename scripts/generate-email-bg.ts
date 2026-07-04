/**
 * Generate the "liquid glass" email background — a soft, heavily-blurred wash
 * of the DEFAULT (Neutral) app palette (cyan #00BBFF → blue), baked into an
 * image so the frosted look renders in email (backdrop-filter can't). Used as
 * the page background behind the white card, with a cool solid fallback color
 * (#F3F6FB) for clients that don't load background images.
 *
 * Output: public/email/bg-glass.jpg — served at {appUrl}/email/bg-glass.jpg.
 * Re-run after a palette change:  pnpm tsx scripts/generate-email-bg.ts
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const W = 960;
const H = 1280;

// Light cool base + faint palette blobs (cyan up top near the header, blue
// toward the bottom). Heavy blur melts them into a frosted gradient.
const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#F3F6FB"/>
  <circle cx="200" cy="150" r="430" fill="#00BBFF" fill-opacity="0.26"/>
  <circle cx="815" cy="90"  r="360" fill="#22C7F5" fill-opacity="0.20"/>
  <circle cx="520" cy="40"  r="300" fill="#6B8CF0" fill-opacity="0.12"/>
  <circle cx="130" cy="1170" r="430" fill="#3FA9E8" fill-opacity="0.16"/>
  <circle cx="880" cy="1250" r="440" fill="#1D6FB8" fill-opacity="0.16"/>
  <circle cx="500" cy="1310" r="360" fill="#5B8FE1" fill-opacity="0.12"/>
</svg>`;

async function main() {
	mkdirSync('public/email', { recursive: true });
	await sharp(Buffer.from(svg))
		.blur(85)
		.jpeg({ quality: 82, progressive: true })
		.toFile('public/email/bg-glass.jpg');
	console.log('✓ wrote public/email/bg-glass.jpg');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
