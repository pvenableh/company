/**
 * Create a pitch page (staff, org-scoped). Accepts a multipart upload:
 *   - fields: organization, title, client_name?, password?, expires_at?, publish?
 *             lead? / client? / contact?  (optional links to a real record)
 *   - files:  html  (the standalone .html document — required)
 *             asset (0..n local assets referenced by the HTML, e.g. the .mp4)
 *
 * The heavy lifting (asset upload + ref rewrite, Google-Font re-hosting, row
 * create, storage accounting) lives in the shared `publishPitch()` util so the
 * AI generate path produces pitches identically. Returns the /p/<token> link.
 *
 * Gated behind the `proposals` feature (pitches are pre-sale collateral).
 */
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { publishPitch, type PublishPitchAsset } from '~~/server/utils/pitch-publish';

function fieldVal(parts: any[], name: string): string {
  const p = parts.find((x) => x.name === name && !x.filename);
  return p?.data ? Buffer.from(p.data).toString('utf8').trim() : '';
}

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event);
  if (!parts?.length) throw createError({ statusCode: 400, message: 'Expected a multipart upload.' });

  const organization = fieldVal(parts, 'organization');
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

  const { userId } = await requireOrgPermission(event, organization, 'proposals', 'create');

  const title = fieldVal(parts, 'title');
  if (!title) throw createError({ statusCode: 400, message: 'title is required' });

  // Optional links to a real record (Pursuits merge). leads.id is an integer PK;
  // clients/contacts are uuids. Blank → null.
  const leadRaw = fieldVal(parts, 'lead');
  const lead = leadRaw && /^\d+$/.test(leadRaw) ? Number(leadRaw) : null;

  const htmlPart = parts.find((p) => p.name === 'html' && p.filename);
  if (!htmlPart?.data?.length) throw createError({ statusCode: 400, message: 'An .html file is required.' });

  const assets: PublishPitchAsset[] = parts
    .filter((p) => p.name === 'asset' && p.filename && p.data?.length)
    .map((p) => ({ bytes: Buffer.from(p.data), filename: p.filename!, type: p.type || 'application/octet-stream' }));

  return await publishPitch({
    organization,
    userId,
    title,
    html: Buffer.from(htmlPart.data).toString('utf8'),
    client_name: fieldVal(parts, 'client_name') || null,
    links: { lead, client: fieldVal(parts, 'client') || null, contact: fieldVal(parts, 'contact') || null },
    password: fieldVal(parts, 'password') || null,
    expires_at: fieldVal(parts, 'expires_at') || null,
    publish: fieldVal(parts, 'publish') === 'true',
    assets,
  });
});
