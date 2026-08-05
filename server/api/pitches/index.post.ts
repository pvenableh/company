/**
 * Create a pitch page (staff, org-scoped). Accepts a multipart upload:
 *   - fields: organization, title, client_name?, password?, expires_at?, publish?
 *   - files:  html  (the standalone .html document — required)
 *             asset (0..n local assets referenced by the HTML, e.g. the .mp4)
 *
 * The HTML is made self-contained at ingest: local asset refs are rewritten to
 * the org's Directus /assets URLs (files land in the org's own Files tree under
 * "Pitches/<title>"), and Google Fonts are downloaded + re-hosted so the served
 * page hits no external CDN. Returns the shareable /p/<token> link.
 *
 * Gated behind the `proposals` feature (pitches are pre-sale collateral).
 */
import { createFolder, createItem, readFolders, readItems, uploadFiles } from '@directus/sdk';
import { randomBytes } from 'node:crypto';
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { hashPitchPassword } from '~~/server/utils/pitch-access';
import { rewriteAssetSrc, selfHostGoogleFonts } from '~~/server/utils/pitch-ingest';
import { optimizeImageBuffer } from '~~/server/utils/image-optimize';
import { addOrgStorageUsage, enforceStorageLimit } from '~~/server/utils/storage-enforcement';

function fieldVal(parts: any[], name: string): string {
  const p = parts.find((x) => x.name === name && !x.filename);
  return p?.data ? Buffer.from(p.data).toString('utf8').trim() : '';
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

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event);
  if (!parts?.length) throw createError({ statusCode: 400, message: 'Expected a multipart upload.' });

  const organization = fieldVal(parts, 'organization');
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

  const { userId } = await requireOrgPermission(event, organization, 'proposals', 'create');

  const title = fieldVal(parts, 'title');
  if (!title) throw createError({ statusCode: 400, message: 'title is required' });
  const clientName = fieldVal(parts, 'client_name') || null;
  // Optional links to a real record (Pursuits merge). leads.id is an integer PK;
  // clients/contacts are uuids. Blank → null.
  const leadRaw = fieldVal(parts, 'lead');
  const lead = leadRaw && /^\d+$/.test(leadRaw) ? Number(leadRaw) : null;
  const client = fieldVal(parts, 'client') || null;
  const contact = fieldVal(parts, 'contact') || null;
  const password = fieldVal(parts, 'password');
  const expiresRaw = fieldVal(parts, 'expires_at');
  const publish = fieldVal(parts, 'publish') === 'true';

  const htmlPart = parts.find((p) => p.name === 'html' && p.filename);
  if (!htmlPart?.data?.length) throw createError({ statusCode: 400, message: 'An .html file is required.' });
  let html = Buffer.from(htmlPart.data).toString('utf8');

  const assetParts = parts.filter((p) => p.name === 'asset' && p.filename && p.data?.length);

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
  for (const a of assetParts) {
    const id = await upload(Buffer.from(a.data), a.filename!, a.type || 'application/octet-stream');
    if (id) assetMap[a.filename!] = assetUrl(id);
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
    client_name: clientName,
    lead,
    client,
    contact,
    token,
    html,
    status: publish ? 'published' : 'draft',
    password_hash: password ? hashPitchPassword(password) : null,
    expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null,
    view_count: 0,
    user_created: userId,
  };
  const created = (await directus.request(createItem('pitch_pages', record as any))) as any;

  // Count the pitch's uploaded assets (video, images, re-hosted fonts) against
  // the org's storage quota.
  if (uploadedBytes) await addOrgStorageUsage(organization, uploadedBytes);

  return {
    id: created?.id ?? null,
    token,
    url: `/p/${token}`,
    fonts: { rehosted: fonts.rehosted, failed: fonts.failed },
    assets: Object.keys(assetMap).length,
  };
});
