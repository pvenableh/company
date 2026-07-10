#!/usr/bin/env npx tsx
/**
 * Phase F — per-channel audience + moderation ACL foundation.
 * (See project_channels_apps_home → "Phase F — ACCESS & MODERATION".)
 *
 * Adds the schema that turns `channel_members` from a pure read-cursor into an
 * access-control list, and gives every channel an explicit audience:
 *
 *   1. channels.audience  — 'organization' (every org member reads it) |
 *                           'restricted'   (only listed members + org admins).
 *                           Default 'organization'. EXISTING rows are back-
 *                           filled to 'organization' so the audience-aware read
 *                           filter (patch-channel-audience-perms.ts) keeps every
 *                           current channel visible — the filter's org-wide
 *                           branch matches `audience._eq 'organization'`, which
 *                           a null value would NOT satisfy.
 *
 *   2. channel_members.role — 'member' | 'moderator' | null. NON-null marks an
 *                           EXPLICIT access grant (the ACL). null = a cursor-only
 *                           row auto-created on first open of an org-wide channel
 *                           (unread tracking) — those must NOT grant access to a
 *                           restricted channel, so the read filter's member
 *                           branch requires role _nnull. 'moderator' also unlocks
 *                           message moderation in that one channel (Phase F4).
 *
 *   3. channels.members  — o2m reverse alias of channel_members.channel, so the
 *                           Directus read filter can traverse channels→members
 *                           (`{ members: { user: { _eq: $CURRENT_USER } } }`).
 *                           Mirrors the organizations.memberships alias pattern
 *                           (setup-org-memberships-alias.ts). Virtual — no DB
 *                           column; only touches Directus metadata.
 *
 * Additive + idempotent. Dry-run by default; --apply to write.
 *   pnpm tsx scripts/setup-channel-audience.ts           # dry-run
 *   pnpm tsx scripts/setup-channel-audience.ts --apply   # write
 *
 * After --apply, run `pnpm generate:types`, then the perm rewrite:
 *   pnpm tsx scripts/patch-channel-audience-perms.ts     # dry-run first!
 */
import 'dotenv/config';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

async function api<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
  const r = await fetch(`${URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) return { data: null, error: `${r.status}: ${text}`, status: r.status };
  const json = text ? JSON.parse(text) : {};
  return { data: (json.data ?? null) as T, error: null, status: r.status };
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  const { status, data } = await api<any>(`/fields/${collection}/${field}`);
  return status === 200 && !!data;
}

async function main() {
  console.log(`\n${APPLY ? '🔧 APPLY' : '🔍 DRY-RUN'} — Directus: ${URL}\n`);

  // ── 1. channels.audience ──────────────────────────────────────────────────
  const hasAudience = await fieldExists('channels', 'audience');
  console.log(`channels.audience field:            ${hasAudience ? 'present' : 'MISSING'}`);
  const audienceField = {
    field: 'audience',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      note: 'Who can read this channel. Organization = every org member; Restricted = only listed members + org owner/admin.',
      options: {
        choices: [
          { text: 'Organization (everyone in the org)', value: 'organization' },
          { text: 'Restricted (invited members only)', value: 'restricted' },
        ],
      },
      width: 'half',
    },
    schema: { default_value: 'organization', is_nullable: false },
  };

  // ── 2. channel_members.role ───────────────────────────────────────────────
  const hasRole = await fieldExists('channel_members', 'role');
  console.log(`channel_members.role field:         ${hasRole ? 'present' : 'MISSING'}`);
  const roleField = {
    field: 'role',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      note: 'NON-null = explicit access grant (ACL). null = cursor-only auto-join row. moderator also unlocks message moderation in this channel.',
      options: {
        choices: [
          { text: 'Member', value: 'member' },
          { text: 'Moderator', value: 'moderator' },
        ],
        allowNone: true,
      },
      width: 'half',
    },
    schema: { is_nullable: true },
  };

  // ── 3. channels.members o2m reverse alias ────────────────────────────────
  const hasMembersAlias = await fieldExists('channels', 'members');
  const relations = (await api<any[]>('/relations?limit=-1')).data || [];
  const memberRel = relations.find((r) => r.collection === 'channel_members' && r.field === 'channel') || null;
  const aliasWired = memberRel?.meta?.one_field === 'members';
  console.log(`channels.members o2m alias field:   ${hasMembersAlias ? 'present' : 'MISSING'}`);
  console.log(`channel_members.channel relation:   ${memberRel ? 'present' : 'MISSING'}`);
  console.log(`  meta.one_field === "members":     ${aliasWired ? 'yes' : 'no'}`);

  const membersAliasField = {
    collection: 'channels',
    field: 'members',
    type: 'alias',
    meta: {
      interface: 'list-o2m',
      special: ['o2m'],
      note: 'Membership/ACL rows (channel_members). Used by the audience read filter in patch-channel-audience-perms.ts.',
    },
    schema: null,
  };

  console.log('\nPlan:');
  console.log(`  ${hasAudience ? 'skip' : 'POST'} channels.audience (string, default "organization")`);
  console.log(`  ${hasAudience ? 'skip' : 'PATCH'} backfill existing channels with null audience → "organization"`);
  console.log(`  ${hasRole ? 'skip' : 'POST'} channel_members.role (string, nullable)`);
  console.log(`  ${hasMembersAlias ? 'skip' : 'POST'} channels.members alias field`);
  console.log(`  ${aliasWired ? 'skip' : (memberRel ? 'PATCH' : 'POST')} channel_members.channel relation one_field = "members"`);
  console.log('');

  if (!APPLY) {
    console.log('DRY RUN. Re-run with --apply to write.');
    return;
  }

  if (!hasAudience) {
    const { error } = await api('/fields/channels', 'POST', audienceField);
    if (error) { console.error(`  ✗ audience field: ${error}`); process.exit(1); }
    console.log('  ✓ created channels.audience');
    // Backfill: default_value only applies to NEW rows; existing rows are null.
    // Set every null → 'organization' so the org-wide read branch matches them.
    const nulls = (await api<any[]>('/items/channels?filter[audience][_null]=true&fields=id&limit=-1')).data || [];
    if (nulls.length) {
      const ids = nulls.map((c) => c.id);
      const { error: bErr } = await api('/items/channels', 'PATCH', { keys: ids, data: { audience: 'organization' } });
      if (bErr) { console.error(`  ✗ backfill: ${bErr}`); process.exit(1); }
      console.log(`  ✓ backfilled ${ids.length} existing channel(s) → audience 'organization'`);
    } else {
      console.log('  ✓ no existing channels needed backfill');
    }
  }

  if (!hasRole) {
    const { error } = await api('/fields/channel_members', 'POST', roleField);
    if (error) { console.error(`  ✗ role field: ${error}`); process.exit(1); }
    console.log('  ✓ created channel_members.role');
  }

  if (!hasMembersAlias) {
    const { error } = await api('/fields/channels', 'POST', membersAliasField);
    if (error) { console.error(`  ✗ members alias field: ${error}`); process.exit(1); }
    console.log('  ✓ created channels.members alias field');
  }

  if (!aliasWired) {
    if (!memberRel) {
      const { error } = await api('/relations', 'POST', {
        collection: 'channel_members',
        field: 'channel',
        related_collection: 'channels',
        meta: { one_field: 'members', one_deselect_action: 'delete', sort_field: null, junction_field: null },
        schema: { on_delete: 'CASCADE' },
      });
      if (error) { console.error(`  ✗ relation: ${error}`); process.exit(1); }
      console.log('  ✓ created channel_members.channel relation (one_field "members")');
    } else {
      // Directus updates relations by collection+field, NOT by meta id.
      const { error } = await api(`/relations/channel_members/channel`, 'PATCH', {
        meta: { ...(memberRel.meta ?? {}), one_field: 'members' },
      });
      if (error) { console.error(`  ✗ relation patch: ${error}`); process.exit(1); }
      console.log('  ✓ patched channel_members.channel relation → one_field "members"');
    }
  }

  console.log('\n✅ Phase F schema ready. Next: pnpm generate:types, then dry-run patch-channel-audience-perms.ts.');
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
