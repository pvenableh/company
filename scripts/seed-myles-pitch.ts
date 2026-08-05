#!/usr/bin/env npx tsx
/**
 * Seed the Myles pitch as a real pitch_pages row (dev/verification helper).
 * Mirrors what POST /api/pitches does — runs the self-host-fonts ingest and
 * drops the re-hosted woff2 into Hue's Files tree — but with the admin token so
 * it needs no browser session. Prints the /p/<token> URL + password.
 *
 *   pnpm tsx scripts/seed-myles-pitch.ts
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { rewriteAssetSrc, selfHostGoogleFonts } from '../server/utils/pitch-ingest';
import { hashPitchPassword } from '../server/utils/pitch-access';

const DIRECTUS_URL = process.env.DIRECTUS_URL!;
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN!;
const HUE_ORG = '423f5e7e-e14c-4348-9fea-89ba5c6b9d96';
const HUE_ROOT_FOLDER = '4a49ac8a-c447-46c9-9cf9-236b36bb111a';
const PASSWORD = 'oceandrive';
const TITLE = 'Myles — Private Events (preview)';

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
  let html = readFileSync(join(homedir(), 'Downloads', 'myles-private-events-v14.html'), 'utf8');

  const pitchesFolder = await findOrCreateFolder('Pitches', HUE_ROOT_FOLDER);
  const folder = pitchesFolder ? await findOrCreateFolder(TITLE.slice(0, 60), pitchesFolder) : null;
  console.log('Target folder:', folder);

  // (No local video handy for the seed; the real endpoint would upload + rewrite it.)
  html = rewriteAssetSrc(html, {});

  console.log('Self-hosting Google Fonts…');
  const fonts = await selfHostGoogleFonts(html, async (bytes, srcUrl) => {
    const name = srcUrl.split('/').pop()?.split('?')[0] || 'font.woff2';
    const id = await uploadFile(bytes, name, 'font/woff2', folder);
    return id ? `${DIRECTUS_URL}/assets/${id}` : null;
  });
  html = fonts.html;
  console.log(`  fonts rehosted: ${fonts.rehosted}, failed: ${fonts.failed}`);

  const token = (await import('node:crypto')).randomBytes(32).toString('hex');
  const record = {
    organization: HUE_ORG, title: TITLE, client_name: 'Myles Restaurant Group',
    token, html, status: 'published',
    password_hash: hashPitchPassword(PASSWORD), view_count: 0,
  };
  const res = await fetch(`${DIRECTUS_URL}/items/pitch_pages`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(record),
  });
  if (!res.ok) { console.error('create failed', res.status, await res.text()); process.exit(1); }
  const j = await res.json();

  console.log('\n=== Seeded ===');
  console.log('id:      ', j?.data?.id);
  console.log('URL:      /p/' + token);
  console.log('password:', PASSWORD);
  console.log('google-fonts refs remaining in stored html:',
    (html.match(/fonts\.g(oogleapis|static)\.com/g) || []).length);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
