/**
 * publishPitch — the shared pitch ingest + persist pipeline.
 *
 * Factored out of server/api/pitches/index.post.ts so both the manual
 * upload-a-file path AND the AI generate path (server/api/pitches/generate.post.ts)
 * produce a `pitch_pages` row the same way: optional local assets are uploaded
 * (optimized + quota-checked) into the org's Files tree and their refs rewritten,
 * Google Fonts are re-hosted so the served page hits no external CDN, and the row
 * is created with an unguessable share token.
 *
 * Callers own auth: gate with requireOrgPermission(event, org, 'proposals',
 * 'create') at the HTTP boundary and pass the resolved userId here.
 */
import { createFolder, createItem, readFolders, readItems, uploadFiles } from '@directus/sdk';
import { randomBytes } from 'node:crypto';
import { getServerDirectus } from '~~/server/utils/directus';
import { hashPitchPassword } from '~~/server/utils/pitch-access';
import { rewriteAssetSrc, selfHostGoogleFonts } from '~~/server/utils/pitch-ingest';
import { optimizeImageBuffer } from '~~/server/utils/image-optimize';
import { addOrgStorageUsage, enforceStorageLimit } from '~~/server/utils/storage-enforcement';

export interface PublishPitchAsset {
  bytes: Buffer;
  filename: string;
  type: string;
}

export interface PublishPitchInput {
  organization: string;
  userId: string;
  title: string;
  /** The standalone HTML document (asset refs still local; fonts via <link> ok). */
  html: string;
  /** Optional links to a real record (Pursuits merge). */
  links?: { lead?: number | null; client?: string | null; contact?: string | null };
  client_name?: string | null;
  password?: string | null;
  /** ISO or any Date-parseable string; stored as ISO. */
  expires_at?: string | null;
  /** false → status 'draft' (the AI path passes false so it's reviewed first). */
  publish?: boolean;
  /** 'pitch' (default) or 'prototype' — a bespoke built page, same serve path. */
  kind?: 'pitch' | 'prototype';
  /** Linked proposal id (the proposal this pitch/prototype supports). */
  proposal?: string | null;
  /** Local files referenced by the HTML (video/images/etc). The AI path passes none. */
  assets?: PublishPitchAsset[];
}

export interface PublishPitchResult {
  id: number | string | null;
  token: string;
  url: string;
  fonts: { rehosted: number; failed: number };
  assets: number;
}

/** Find-or-create a folder named `name` under `parent`. Returns its id or null. */
async function findOrCreateFolder(directus: any, name: string, parent: string): Promise<string | null> {
  const existing = (await directus.request(
    readFolders({ filter: { parent: { _eq: parent }, name: { _eq: name } }, fields: ['id'], limit: 1 }),
  )) as any[];
  if (existing?.[0]?.id) return existing[0].id;
  const created = (await directus.request(createFolder({ name, parent }))) as any;
  return created?.id ?? null;
}

export async function publishPitch(input: PublishPitchInput): Promise<PublishPitchResult> {
  const {
    organization, userId, title, links,
    client_name = null, password = null, expires_at = null, publish = false, assets = [],
    kind, proposal = null,
  } = input;
  let html = input.html;

  const directus = getServerDirectus();
  const directusUrl = useRuntimeConfig().public.directusUrl as string;
  const assetUrl = (id: string) => `${directusUrl}/assets/${id}`;

  // Resolve the org root folder, then Pitches/<title> beneath it.
  const orgs = (await directus.request(
    readItems('organizations', { filter: { id: { _eq: organization } }, fields: ['id', 'folder'], limit: 1 }),
  )) as any[];
  const rootFolder = orgs?.[0]?.folder || null;
  let pitchFolder: string | null = null;
  if (rootFolder) {
    const pitches = await findOrCreateFolder(directus, 'Pitches', rootFolder);
    pitchFolder = pitches ? await findOrCreateFolder(directus, title.slice(0, 60), pitches) : null;
  }

  let uploadedBytes = 0;
  async function upload(bytes: Buffer, filename: string, type: string): Promise<string | null> {
    // Smart-optimize image assets; fonts/video pass through untouched.
    const opt = await optimizeImageBuffer(bytes, type, filename);
    // Per-file cap + org quota (against the final, optimized size).
    await enforceStorageLimit(organization, opt.bytes.length);
    const form = new FormData();
    if (pitchFolder) form.append('folder', pitchFolder);
    form.append('title', `${title} — ${opt.filename}`);
    form.append('file', new Blob([opt.bytes], { type: opt.type }), opt.filename);
    try {
      const up = (await directus.request(uploadFiles(form))) as any;
      if (up?.id) uploadedBytes += opt.bytes.length;
      return up?.id ?? null;
    } catch (err: any) {
      console.error('[pitches] asset upload failed:', filename, err?.message || err);
      return null;
    }
  }

  // 1. Upload local assets and rewrite their references in the HTML.
  const assetMap: Record<string, string> = {};
  for (const a of assets) {
    const id = await upload(a.bytes, a.filename, a.type || 'application/octet-stream');
    if (id) assetMap[a.filename] = assetUrl(id);
  }
  if (Object.keys(assetMap).length) html = rewriteAssetSrc(html, assetMap);

  // 2. Re-host Google Fonts so the served pitch hits no external CDN.
  const fonts = await selfHostGoogleFonts(html, async (bytes, srcUrl) => {
    const name = srcUrl.split('/').pop()?.split('?')[0] || 'font.woff2';
    const id = await upload(bytes, name, 'font/woff2');
    return id ? assetUrl(id) : null;
  });
  html = fonts.html;

  // 3. Persist. Token is the unguessable share capability.
  const token = randomBytes(32).toString('hex');
  const record: Record<string, any> = {
    organization,
    title,
    client_name,
    lead: links?.lead ?? null,
    client: links?.client ?? null,
    contact: links?.contact ?? null,
    ...(kind ? { kind } : {}), // else DB default 'pitch'
    proposal,
    token,
    html,
    status: publish ? 'published' : 'draft',
    password_hash: password ? hashPitchPassword(password) : null,
    expires_at: expires_at ? new Date(expires_at).toISOString() : null,
    view_count: 0,
    user_created: userId || null,
  };
  const created = (await directus.request(createItem('pitch_pages', record as any))) as any;

  if (uploadedBytes) await addOrgStorageUsage(organization, uploadedBytes);

  return {
    id: created?.id ?? null,
    token,
    url: `/p/${token}`,
    fonts: { rehosted: fonts.rehosted, failed: fonts.failed },
    assets: Object.keys(assetMap).length,
  };
}
