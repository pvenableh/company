#!/usr/bin/env npx tsx
/**
 * Grant the CLIENT PORTAL policy read on `organizations` + `client_portal_users`.
 *
 * Bug: portal users are assigned the "Client Portal" role (a8ef429c, env
 * NUXT_PUBLIC_DIRECTUS_ROLE_PORTAL) → policy 2d6c66e8. But
 * `setup-client-portal-org-perms.ts` granted the org/portal read filters to the
 * *Client* policy (cdadd1fd) instead — the wrong policy. So a real portal user
 * (e.g. dnolan@greaterops.org, Client Portal role) can read NEITHER their own
 * `client_portal_users` row NOR their org. `useOrganization` then loads empty,
 * `client-portal.global` can't detect them, and `needs-org` bounces them to
 * /organization/new instead of /portal.
 *
 * Fix: mirror the Client policy's org + client_portal_users read permissions onto
 * the Client Portal policy. Row-filtered to the user's OWN rows, so a portal user
 * only ever sees the org they're a client of. Idempotent.
 *
 *   pnpm tsx scripts/grant-client-portal-policy-read-perms.ts
 */
import 'dotenv/config';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

// "Client Portal" policy (role a8ef429c).
const PORTAL_POLICY_ID = '2d6c66e8-5211-4dca-a696-1e7d868f5d6d';

async function req(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  const r = await fetch(`${URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) return { data: null, error: text ? (JSON.parse(text).errors?.[0]?.message || text) : `HTTP ${r.status}` };
  return { data: text ? JSON.parse(text).data : null, error: null };
}

async function ensureReadPerm(collection: string, fields: string[], permissions: any) {
  const existing = await req(
    `/permissions?filter[policy][_eq]=${PORTAL_POLICY_ID}&filter[collection][_eq]=${collection}&filter[action][_eq]=read&limit=1`,
  );
  if (Array.isArray(existing.data) && existing.data.length > 0) {
    console.log(`  ✓ ${collection}.read already exists on Client Portal policy`);
    return;
  }
  const { error } = await req('/permissions', 'POST', {
    policy: PORTAL_POLICY_ID,
    collection,
    action: 'read',
    fields,
    permissions,
  });
  if (error) console.error(`  ✗ ${collection}.read failed: ${error}`);
  else console.log(`  + ${collection}.read granted to Client Portal policy`);
}

async function main() {
  console.log(`\n── Client Portal policy read perms ──\nDirectus: ${URL}\n`);

  // organizations: the user's own org(s) — via a junction row OR a portal row.
  await ensureReadPerm('organizations', ['*'], {
    _or: [
      { users: { directus_users_id: { _eq: '$CURRENT_USER' } } },
      { client_portal_users: { user: { _eq: '$CURRENT_USER' } } },
    ],
  });

  // client_portal_users: only the caller's own rows.
  await ensureReadPerm('client_portal_users', ['*'], {
    user: { _eq: '$CURRENT_USER' },
  });

  console.log('\n── Done ──');
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
