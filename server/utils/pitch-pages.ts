// server/utils/pitch-pages.ts
/**
 * Shared server helpers for the public pitch-page endpoints. Reads use the
 * admin server token (getServerDirectus) so the pitch_pages collection can stay
 * unlistable to anon — the unguessable `token` is the only capability. Every
 * public endpoint funnels through here so the "does this link work right now?"
 * logic (revoked / expired / draft) lives in exactly one place.
 */
import { readItems } from '@directus/sdk';

export interface PitchRow {
  id: string;
  title: string;
  client_name: string | null;
  html: string | null;
  token: string;
  status: 'draft' | 'published' | 'revoked' | string;
  password_hash: string | null;
  expires_at: string | null;
  view_count: number | null;
}

export type PitchGateState = 'ok' | 'not_found' | 'revoked' | 'expired';

/** Look up a pitch by its share token using the admin client. Null if none. */
export async function fetchPitchByToken(token: string): Promise<PitchRow | null> {
  // Guard against trivially short/guessable tokens (mirrors social by-token).
  if (typeof token !== 'string' || token.length < 16) return null;
  const directus = getServerDirectus();
  const rows = (await directus.request(
    readItems('pitch_pages', {
      fields: [
        'id', 'title', 'client_name', 'html', 'token',
        'status', 'password_hash', 'expires_at', 'view_count',
      ],
      filter: { token: { _eq: token } },
      limit: 1,
    }),
  )) as unknown as PitchRow[];
  return rows?.[0] ?? null;
}

/** Is this link live right now? Only a published, unexpired row serves. */
export function pitchGateState(row: PitchRow | null): PitchGateState {
  if (!row) return 'not_found';
  if (row.status === 'revoked') return 'revoked';
  if (row.status !== 'published') return 'not_found'; // drafts read as "doesn't exist"
  if (row.expires_at && Date.now() > new Date(row.expires_at).getTime()) return 'expired';
  return 'ok';
}
