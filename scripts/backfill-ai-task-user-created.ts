#!/usr/bin/env npx tsx
/**
 * One-off backfill: re-attribute tasks that were created by the AI sidebar
 * before the user-scoped-client fix (2026-05-20) and ended up with
 * user_created = "API Admin" (the static server token's owner).
 *
 * For a given project, find tasks where user_created matches the API Admin
 * user and re-assign them to the target user (defaults to peter@huestudios.com,
 * since they're the only operator hitting the AI sidebar today).
 *
 * Dry-run by default. Pass --apply to actually write.
 *
 *   pnpm tsx scripts/backfill-ai-task-user-created.ts
 *   pnpm tsx scripts/backfill-ai-task-user-created.ts --apply
 *
 * Env overrides:
 *   TARGET_PROJECT_ID  (default: 1f8cac5e-82fc-495e-b499-12783d048fcc)
 *   TARGET_USER_EMAIL  (default: peter@huestudios.com)
 *   API_ADMIN_EMAIL    (default: auto-detect by role.admin_access + name match)
 */

import 'dotenv/config';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');
const PROJECT_ID = process.env.TARGET_PROJECT_ID || '1f8cac5e-82fc-495e-b499-12783d048fcc';
const TARGET_EMAIL = process.env.TARGET_USER_EMAIL || 'peter@huestudios.com';
const API_ADMIN_EMAIL_OVERRIDE = process.env.API_ADMIN_EMAIL || '';

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${r.status} on ${path}\n${body}`);
  }
  if (r.status === 204) return undefined as any;
  const j = await r.json();
  return j.data;
}

interface DirectusUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface TaskRow {
  id: string;
  title: string | null;
  user_created: string | null;
  project_id: string | null;
}

async function findUserByEmail(email: string): Promise<DirectusUser> {
  const users = await api<DirectusUser[]>(
    `/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=id,email,first_name,last_name&limit=1`,
  );
  if (!users.length) throw new Error(`No user with email ${email}`);
  return users[0]!;
}

async function findApiAdminUser(): Promise<DirectusUser> {
  if (API_ADMIN_EMAIL_OVERRIDE) return findUserByEmail(API_ADMIN_EMAIL_OVERRIDE);
  // Heuristic: find users whose first/last name literally contains "API"
  const candidates = await api<DirectusUser[]>(
    `/users?filter[_or][0][first_name][_icontains]=api&filter[_or][1][last_name][_icontains]=api&fields=id,email,first_name,last_name&limit=10`,
  );
  if (!candidates.length) throw new Error('Could not auto-detect API Admin user. Set API_ADMIN_EMAIL env var.');
  if (candidates.length > 1) {
    console.warn(`  Multiple candidates for API Admin — picking first. All: ${candidates.map(c => `${c.first_name} ${c.last_name} <${c.email}>`).join('; ')}`);
  }
  return candidates[0]!;
}

async function main() {
  console.log(`Backfill AI-task user_created — apply=${APPLY}`);
  console.log(`  Project: ${PROJECT_ID}`);

  const target = await findUserByEmail(TARGET_EMAIL);
  console.log(`  Target user: ${target.first_name ?? ''} ${target.last_name ?? ''} <${target.email}> (${target.id})`);

  const apiAdmin = await findApiAdminUser();
  console.log(`  API Admin:   ${apiAdmin.first_name ?? ''} ${apiAdmin.last_name ?? ''} <${apiAdmin.email}> (${apiAdmin.id})`);

  if (apiAdmin.id === target.id) {
    console.error('  Target user IS the API Admin — refusing to no-op.');
    process.exit(1);
  }

  // Pull tasks for this project where user_created = API Admin
  const tasks = await api<TaskRow[]>(
    `/items/tasks?filter[_and][0][project_id][_eq]=${PROJECT_ID}&filter[_and][1][user_created][_eq]=${apiAdmin.id}&fields=id,title,user_created,project_id&limit=500`,
  );
  console.log(`\nFound ${tasks.length} tasks on this project with user_created=API Admin.`);
  for (const t of tasks.slice(0, 20)) console.log(`  - ${t.id}  ${t.title ?? '(no title)'}`);
  if (tasks.length > 20) console.log(`  …and ${tasks.length - 20} more`);

  if (!tasks.length) {
    console.log('\nNothing to do.');
    return;
  }

  if (!APPLY) {
    console.log('\nDry-run. Re-run with --apply.');
    return;
  }

  let applied = 0;
  let failed = 0;
  for (const t of tasks) {
    try {
      await api(`/items/tasks/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ user_created: target.id }),
      });
      applied++;
    } catch (err: any) {
      failed++;
      console.warn(`  ${t.id}: ${err.message.split('\n')[0]}`);
    }
  }
  console.log(`\nApplied ${applied}/${tasks.length} (${failed} failed).`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
