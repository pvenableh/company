#!/usr/bin/env npx tsx
/**
 * Phase F — rewrite `channels` + `messages` READ perms to be audience-aware.
 * (See project_channels_apps_home → "Phase F — ACCESS & MODERATION".)
 *
 * TODAY: channels.read = { organization._in $CURRENT_USER.orgs } — every staff
 * member of an org can read EVERY channel in it. Client-specific channels are
 * therefore readable org-wide (the confidentiality gap Phase F closes).
 *
 * AFTER: a channel is readable iff ONE of three branches holds (CHANNEL_ACCESS):
 *   1. org-wide      — audience = 'organization' AND I belong to its org
 *   2. explicit member — a channel_members row for me with role NON-null
 *                        (role=null rows are cursor-only auto-joins → NOT access)
 *   3. org admin bypass — I am an active owner/admin of the channel's org
 *                        (walks channel.organization.memberships, mirrors the
 *                        org row-perm rule in setup-org-row-permissions.ts)
 * Messages inherit: messages.read = { channel: CHANNEL_ACCESS }.
 *
 * SCOPE OF THIS SCRIPT — reads only. update/delete keep TODAY's shape but gain
 * the audience walk so restricted-channel writes are also enforced:
 *   - messages.update stays permissive-within-an-accessible-channel (matches
 *     current behavior; admin hide-via-update keeps working pre-F4).
 *   - messages.delete stays own-message-only, now audience-scoped.
 * Moderation of OTHERS' messages (owner/moderator/admin hide+remove) lands in
 * Phase F4 via an admin-token server route, NOT by loosening these perms.
 *
 * PREREQUISITE: run scripts/setup-channel-audience.ts --apply first (adds
 * channels.audience, channel_members.role, channels.members o2m alias). Without
 * the `members` alias, branch 2 cannot resolve.
 *
 * Idempotent. Dry-run by default; --apply to mutate. Prints before→after.
 *   pnpm tsx scripts/patch-channel-audience-perms.ts            # dry-run
 *   pnpm tsx scripts/patch-channel-audience-perms.ts --apply    # mutate
 *
 * Rollback: the prior filters were the plain org scope —
 *   channels.read  = { organization: { _in: '$CURRENT_USER.organizations.organizations_id' } }
 *   messages.read  = { channel: { organization: { _in: '…' } } }
 *   messages.update= { channel: { organization: { _in: '…' } } }
 *   messages.delete= { _and: [ { user_created: { _eq: '$CURRENT_USER' } }, { channel: { organization: { _in: '…' } } } ] }
 * Re-PATCH those to revert.
 */
import 'dotenv/config';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

// Policies that carry the staff-facing channel/message read perms. Client
// Manager is the default Earnest user role; Client is attached alongside it.
const POLICY = {
  CLIENT_MANAGER: '012beff9-150c-49e9-a284-1a7e2757e0dd',
  CLIENT:         'cdadd1fd-280e-4d4a-83e6-1b911889af46',
} as const;
const TARGET_POLICIES = new Set<string>([POLICY.CLIENT_MANAGER, POLICY.CLIENT]);

const ORGS_IN = '$CURRENT_USER.organizations.organizations_id';

// The three-branch audience filter — a channel row is readable iff any holds.
const CHANNEL_ACCESS = {
  _or: [
    // 1. org-wide channel, and I'm a member of its organization
    { _and: [
      { audience: { _eq: 'organization' } },
      { organization: { _in: ORGS_IN } },
    ] },
    // 2. explicit access grant — a channel_members row for me with a role set
    { members: { _and: [
      { user: { _eq: '$CURRENT_USER' } },
      { role: { _nnull: true } },
    ] } },
    // 3. org owner/admin bypass — active owner/admin of the channel's org
    { organization: { memberships: { _and: [
      { user: { _eq: '$CURRENT_USER' } },
      { status: { _eq: 'active' } },
      { role: { slug: { _in: ['owner', 'admin'] } } },
    ] } } },
  ],
};

const MESSAGE_ACCESS = { channel: CHANNEL_ACCESS };
const MESSAGE_DELETE = { _and: [{ user_created: { _eq: '$CURRENT_USER' } }, { channel: CHANNEL_ACCESS }] };

// Desired permissions[collection][action] — applied to any TARGET policy that
// currently has that (collection, action) read/update/delete row.
const DESIRED: Record<string, Record<string, any>> = {
  channels: { read: CHANNEL_ACCESS },
  messages: { read: MESSAGE_ACCESS, update: MESSAGE_ACCESS, delete: MESSAGE_DELETE },
};

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${init?.method || 'GET'} ${path}\n${await r.text().catch(() => '')}`);
  if (r.status === 204) return undefined as any;
  return (await r.json()).data;
}

async function main() {
  const allPerms = await api<any[]>('/permissions?fields=id,policy,collection,action,permissions&limit=-1');
  const policies = await api<any[]>('/policies?fields=id,name&limit=-1');
  const pName = (id: string) => policies.find((p) => p.id === id)?.name || id;

  type Op = { id: number; label: string; before: any; after: any };
  const ops: Op[] = [];

  for (const p of allPerms) {
    if (!TARGET_POLICIES.has(p.policy)) continue;
    const desired = DESIRED[p.collection]?.[p.action];
    if (!desired) continue;
    if (JSON.stringify(p.permissions) === JSON.stringify(desired)) continue;
    ops.push({
      id: p.id,
      label: `${pName(p.policy)}.${p.collection}.${p.action}`,
      before: p.permissions,
      after: desired,
    });
  }

  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} — Directus: ${URL}`);
  console.log(`Planned rewrites: ${ops.length}\n`);
  for (const o of ops) {
    console.log(`  PATCH perms#${o.id}  ${o.label}`);
    console.log(`      before: ${JSON.stringify(o.before)}`);
    console.log(`      after:  ${JSON.stringify(o.after)}\n`);
  }

  // Sanity: warn if a target read perm is missing entirely (would mean nobody
  // can read that collection under this policy — likely a discovery miss).
  for (const policyId of TARGET_POLICIES) {
    for (const [col, actions] of Object.entries(DESIRED)) {
      if (!('read' in actions)) continue;
      const has = allPerms.some((p) => p.policy === policyId && p.collection === col && p.action === 'read');
      if (!has) console.log(`  ⚠️  ${pName(policyId)} has NO ${col}.read row — check whether this policy should read ${col}.`);
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN. Re-run with --apply to mutate. (Rollback shapes are in the file header.)');
    return;
  }

  let applied = 0;
  for (const o of ops) {
    try {
      await api(`/permissions/${o.id}`, { method: 'PATCH', body: JSON.stringify({ permissions: o.after }) });
      applied++;
      console.log(`  ✓ ${o.label}`);
    } catch (err: any) {
      console.error(`  ✗ ${o.label}: ${err.message}`);
    }
  }
  console.log(`\nApplied ${applied}/${ops.length}. Verify: open the hub as a non-admin + as an admin; confirm restricted channels are hidden from non-members.`);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
