#!/usr/bin/env npx tsx
/**
 * Directus `ai_actions` — Permissions Setup Script
 *
 * Grants non-admin roles READ access to their OWN ai_actions rows so the
 * app can show the AI activity / approval queue. That's all the app needs:
 *   - Writes (logging proposed/executed actions) go through the server on the
 *     admin token (see server/utils/ai-actions.ts).
 *   - Approve/reject also go through server endpoints on the admin token, so
 *     users never need create/update/delete here.
 *
 * Scope: `user = $CURRENT_USER` — a user sees the actions they triggered,
 * mirroring how ai_chat_sessions are scoped (setup-ai-permissions.ts). Org-wide
 * visibility can be added later if managers need to see teammates' actions.
 *
 * Usage:
 *   pnpm tsx scripts/setup-ai-actions-permissions.ts
 *
 * Prerequisites:
 *   - ai_actions collection created (run setup-ai-actions-collection.ts first)
 *   - DIRECTUS_SERVER_TOKEN (admin) env var set
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

// Admin role has full access by default — skip it. (ID from useRole.ts, same as setup-ai-permissions.ts.)
const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) return { data: null, error: `${response.status}: ${text}` };
    const json = text ? JSON.parse(text) : {};
    return { data: (json.data ?? null) as T, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

async function getNonAdminRoles(): Promise<Array<{ id: string; name: string }>> {
  const { data } = await directusRequest<any[]>('/roles?fields=id,name&filter[id][_neq]=' + ADMIN_ROLE_ID);
  return data || [];
}

/** Find a non-admin policy attached to a role (Directus 11 access entries). */
async function findPolicyForRole(roleId: string): Promise<string | null> {
  const { data: accessEntries } = await directusRequest<any[]>(
    `/access?filter[role][_eq]=${roleId}&fields=id,role,policy.id,policy.admin_access`,
  );
  if (accessEntries && accessEntries.length) {
    for (const entry of accessEntries) {
      const policy = entry.policy;
      if (!policy) continue;
      if (typeof policy === 'object' && policy.admin_access) continue;
      return typeof policy === 'string' ? policy : policy.id;
    }
  }
  return null;
}

async function permissionExists(policyId: string, collection: string, action: string): Promise<boolean> {
  const { data } = await directusRequest<any[]>(
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`,
  );
  return !!data && data.length > 0;
}

async function main() {
  console.log('=========================================');
  console.log('  ai_actions — Permissions Setup');
  console.log('=========================================');
  console.log(`Target: ${DIRECTUS_URL}\n`);

  const { error: connErr } = await directusRequest('/server/info');
  if (connErr) {
    console.error(`Cannot connect to Directus: ${connErr}`);
    process.exit(1);
  }

  const roles = await getNonAdminRoles();
  console.log(`Found ${roles.length} non-admin role(s).`);

  // Read own rows only.
  const READ_RULE = {
    collection: 'ai_actions',
    action: 'read',
    permissions: { user: { _eq: '$CURRENT_USER' } },
    validation: null,
    presets: null,
    fields: ['*'],
  };

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const role of roles) {
    console.log(`\n--- ${role.name} ---`);
    const policyId = await findPolicyForRole(role.id);
    if (!policyId) {
      console.log('  No non-admin policy found — skipping (run setup-ai-permissions.ts first if this role should have AI access).');
      continue;
    }
    if (await permissionExists(policyId, 'ai_actions', 'read')) {
      console.log('  [skip] ai_actions.read already exists');
      skipped++;
      continue;
    }
    const { error } = await directusRequest('/permissions', 'POST', {
      policy: policyId,
      collection: READ_RULE.collection,
      action: READ_RULE.action,
      permissions: READ_RULE.permissions,
      validation: READ_RULE.validation,
      presets: READ_RULE.presets,
      fields: READ_RULE.fields,
    });
    if (error) {
      console.error(`  [fail] ai_actions.read: ${error}`);
      failed++;
    } else {
      console.log('  [ok]   ai_actions.read (own rows)');
      created++;
    }
  }

  console.log('\n=========================================');
  console.log(`  Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`);
  console.log('=========================================');
  console.log('Note: writes + approve/reject go through server endpoints on the admin token,');
  console.log('so no create/update/delete permissions are granted to app users here.');
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
