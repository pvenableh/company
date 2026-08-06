#!/usr/bin/env npx tsx
/**
 * Update the EXISTING Myles pitch_pages row (id 1) in place with the latest
 * built HTML — same token, URL, and password. Self-hosts the Google Fonts into
 * Hue's Files tree first (kills the CDN dependency), then PATCHes only `html`.
 *
 * Use this to re-publish design changes to a live pitch without minting a new
 * link (seed-myles-pitch.ts creates a NEW row; this one edits the current one).
 *
 *   pnpm tsx scripts/update-myles-pitch.ts
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rewriteAssetSrc, selfHostGoogleFonts } from '../server/utils/pitch-ingest';

const DIRECTUS_URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN!;
const HUE_ROOT_FOLDER = '4a49ac8a-c447-46c9-9cf9-236b36bb111a';
const PITCH_ID = 1;
const TITLE = 'Myles — Private Events';

const H = { Authorization: `Bearer ${TOKEN}` };

async function findOrCreateFolder(name: string, parent: string): Promise<string | null> {
  const q = new URLSearchParams({
    'filter[parent][_eq]': parent, 'filter[name][_eq]': name, 'fields': 'id', 'limit': '1',
  });
  const ex = await fetch(`${DIRECTUS_URL}/folders?${q}`, { headers: H }).then((r) => r.json());
  if (ex?.data?.[0]?.id) return ex.data[0].id;
  const made = await fetch(`${DIRECTUS_URL}/folders`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent }),
  }).then((r) => r.json());
  return made?.data?.id ?? null;
}

async function uploadFile(bytes: Buffer, filename: string, type: string, folder: string | null): Promise<string | null> {
  const form = new FormData();
  if (folder) form.append('folder', folder);
  form.append('title', `${TITLE} — ${filename}`);
  form.append('file', new Blob([bytes], { type }), filename);
  const res = await fetch(`${DIRECTUS_URL}/files`, { method: 'POST', headers: H, body: form });
  if (!res.ok) { console.error('upload failed', filename, res.status, await res.text()); return null; }
  const j = await res.json();
  return j?.data?.id ?? null;
}

async function main() {
  if (!DIRECTUS_URL || !TOKEN) { console.error('Missing DIRECTUS_URL / DIRECTUS_SERVER_TOKEN'); process.exit(1); }

  let html = readFileSync(fileURLToPath(new URL('./myles-private-events.html', import.meta.url)), 'utf8');
  console.log('Loaded HTML:', (html.length / 1024).toFixed(0) + 'KB');

  const pitchesFolder = await findOrCreateFolder('Pitches', HUE_ROOT_FOLDER);
  const folder = pitchesFolder ? await findOrCreateFolder('Myles fonts', pitchesFolder) : null;

  // Images/videos already reference absolute Directus URLs, so this is a no-op —
  // kept for parity with the publish path.
  html = rewriteAssetSrc(html, {});

  console.log('Self-hosting Google Fonts…');
  const fonts = await selfHostGoogleFonts(html, async (bytes, srcUrl) => {
    const name = srcUrl.split('/').pop()?.split('?')[0] || 'font.woff2';
    const id = await uploadFile(bytes, name, 'font/woff2', folder);
    return id ? `${DIRECTUS_URL}/assets/${id}` : null;
  });
  html = fonts.html;
  console.log(`  fonts rehosted: ${fonts.rehosted}, failed: ${fonts.failed}`);
  const remaining = (html.match(/fonts\.g(oogleapis|static)\.com/g) || []).length;
  console.log('  google-fonts refs remaining:', remaining);

  const res = await fetch(`${DIRECTUS_URL}/items/pitch_pages/${PITCH_ID}`, {
    method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });
  if (!res.ok) { console.error('PATCH failed', res.status, await res.text()); process.exit(1); }
  const j = await res.json();
  console.log('\n=== Updated pitch_pages/' + PITCH_ID + ' ===');
  console.log('title:  ', j?.data?.title);
  console.log('token:  ', j?.data?.token);
  console.log('URL:     /p/' + j?.data?.token, '(unchanged)');
  console.log('has bgvid in stored html:', /class="bgvid"/.test(html));
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
