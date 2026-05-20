#!/usr/bin/env npx tsx
/**
 * Backfill social_posts → content_plans.
 *
 * Idempotent. Safe to re-run.
 *
 * Why: the initial setup-content-plans.ts script defined
 *   - content_plans.project as NOT NULL, but in reality 100% of existing
 *     social_posts have project=null. Tighten-after-data-exists isn't an
 *     option; we relax instead.
 *   - content_plans had no `organization` column, leaving the list/read
 *     endpoints unable to scope by tenant. Same shape as the contacts
 *     cross-org audit that landed earlier. We add it required.
 *
 * What it does, in order:
 *   1. Relax content_plans.project to nullable (PATCH schema + meta).
 *   2. Add content_plans.organization (NOT NULL, FK organizations) + relation.
 *      Existing plan rows get backfilled from any attached post; orphan
 *      plans (no posts, no inferable org) are deleted.
 *   3. For every social_posts row with content_plan=null, find-or-create
 *      an Inbox plan keyed on (organization, target_month). target_month
 *      null is its own bucket.
 *   4. PATCH each post to point at its bucket plan.
 *
 * Run:
 *   pnpm tsx scripts/backfill-content-plans.ts          # dry run by default
 *   pnpm tsx scripts/backfill-content-plans.ts --apply  # actually mutate
 */

import 'dotenv/config'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''
const APPLY = process.argv.includes('--apply')

if (!DIRECTUS_TOKEN) {
  console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required')
  process.exit(1)
}

async function dx<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = text ? JSON.parse(text) : {}
      message = err.errors?.[0]?.message || err.message || message
    } catch {
      if (text) message = text
    }
    return { data: null, error: message, status: res.status }
  }
  const json = text ? JSON.parse(text) : {}
  return { data: (json.data ?? null) as T, error: null, status: res.status }
}

function tag(s: string) {
  return APPLY ? s : `[dry] ${s}`
}

// ── Step 1: relax content_plans.project ────────────────────────────

async function relaxProject() {
  console.log('\n— Step 1: relax content_plans.project to nullable —')
  const { data: field } = await dx<any>('/fields/content_plans/project')
  if (!field) {
    console.log('  ✓ field does not exist yet — nothing to relax')
    return
  }
  const nullable = field.schema?.is_nullable === true
  const required = field.meta?.required === true
  if (nullable && !required) {
    console.log('  ✓ already nullable + not required')
    return
  }
  console.log(`  ${tag('PATCH')} content_plans.project → nullable=true required=false`)
  if (!APPLY) return
  const { error } = await dx('/fields/content_plans/project', 'PATCH', {
    meta: { required: false },
    schema: { is_nullable: true },
  })
  if (error) console.error(`  ✗ ${error}`)
  else console.log(`  + relaxed`)
}

// ── Step 2: add content_plans.organization ─────────────────────────

async function addOrganization() {
  console.log('\n— Step 2: add content_plans.organization (NOT NULL FK) —')
  const { data: existing } = await dx<any>('/fields/content_plans/organization')
  if (existing) {
    console.log('  ✓ field already exists')
  } else {
    console.log(`  ${tag('CREATE')} content_plans.organization (initially nullable; tightened after backfill)`)
    if (APPLY) {
      const { error } = await dx('/fields/content_plans', 'POST', {
        field: 'organization',
        type: 'uuid',
        meta: {
          interface: 'select-dropdown-m2o',
          special: ['m2o'],
          display: 'related-values',
          display_options: { template: '{{name}}' },
          required: false, // tightened below
          width: 'half',
          note: 'Owning organization (tenant scope).',
          options: { template: '{{name}}' },
        },
        schema: { is_nullable: true, foreign_key_table: 'organizations' },
      })
      if (error) {
        console.error(`  ✗ create failed: ${error}`)
        return
      }
      console.log(`  + organization field created`)
    }
  }

  const { data: rel } = await dx<any>('/relations/content_plans/organization')
  if (rel) {
    console.log('  ✓ relation already exists')
  } else {
    console.log(`  ${tag('CREATE')} relation content_plans.organization → organizations`)
    if (APPLY) {
      const { error } = await dx('/relations', 'POST', {
        collection: 'content_plans',
        field: 'organization',
        related_collection: 'organizations',
        meta: { sort_field: null },
      })
      if (error) console.error(`  ✗ relation failed: ${error}`)
      else console.log(`  + relation created`)
    }
  }

  // Backfill organization on any existing plan rows.
  const { data: plans } = await dx<any[]>('/items/content_plans?fields=id,organization,target_client,project&limit=-1')
  if (!plans?.length) {
    console.log('  ✓ no existing plan rows to backfill')
  } else {
    for (const plan of plans) {
      if (plan.organization) continue
      // Infer from any attached post.
      const { data: posts } = await dx<any[]>(
        `/items/social_posts?filter[content_plan][_eq]=${plan.id}&fields=organization&limit=1`,
      )
      const inferred = posts?.[0]?.organization || null
      if (!inferred) {
        console.log(`  ${tag('DELETE')} plan ${plan.id} — no organization inferable (no posts attached)`)
        if (APPLY) await dx(`/items/content_plans/${plan.id}`, 'DELETE')
        continue
      }
      console.log(`  ${tag('PATCH')} plan ${plan.id}.organization = ${inferred}`)
      if (APPLY) await dx(`/items/content_plans/${plan.id}`, 'PATCH', { organization: inferred })
    }
  }

  // Tighten to NOT NULL.
  const { data: refreshed } = await dx<any>('/fields/content_plans/organization')
  if (refreshed?.schema?.is_nullable === false && refreshed?.meta?.required === true) {
    console.log('  ✓ organization already NOT NULL + required')
  } else {
    console.log(`  ${tag('PATCH')} content_plans.organization → NOT NULL + required`)
    if (APPLY) {
      const { error } = await dx('/fields/content_plans/organization', 'PATCH', {
        meta: { required: true },
        schema: { is_nullable: false },
      })
      if (error) console.error(`  ✗ tighten failed: ${error}`)
      else console.log(`  + tightened`)
    }
  }
}

// ── Step 3+4: bucket posts and attach ──────────────────────────────

interface PostRow {
  id: string
  organization: string
  target_month: string | null
  content_plan: number | null
}

function bucketKey(organization: string, target_month: string | null) {
  return `${organization}::${target_month ?? '_null'}`
}

function monthLabel(target_month: string | null): string {
  if (!target_month) return 'Inbox'
  const d = new Date(target_month)
  if (Number.isNaN(d.getTime())) return `Inbox — ${target_month}`
  return `Inbox — ${d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
}

async function findOrCreatePlan(
  organization: string,
  target_month: string | null,
): Promise<number | null> {
  const monthFilter = target_month
    ? `&filter[target_month][_eq]=${target_month}`
    : `&filter[target_month][_null]=true`
  const { data: existing } = await dx<any[]>(
    `/items/content_plans?filter[organization][_eq]=${organization}` +
      `&filter[plan_type][_eq]=monthly_cadence` +
      `&filter[state][_eq]=draft` +
      `&filter[project][_null]=true` +
      `&filter[target_client][_null]=true` +
      monthFilter +
      `&fields=id,title&limit=1`,
  )
  if (existing && existing[0]) return existing[0].id

  const title = monthLabel(target_month)
  console.log(`  ${tag('CREATE')} plan "${title}" for org ${organization.slice(0, 8)}…`)
  if (!APPLY) return -1
  const { data, error } = await dx<any>('/items/content_plans', 'POST', {
    organization,
    title,
    plan_type: 'monthly_cadence',
    state: 'draft',
    target_month,
  })
  if (error) {
    console.error(`  ✗ create plan failed: ${error}`)
    return null
  }
  return data?.id ?? null
}

async function backfillPosts() {
  console.log('\n— Step 3+4: bucket posts + attach to Inbox plans —')
  const { data: posts } = await dx<PostRow[]>(
    `/items/social_posts?fields=id,organization,target_month,content_plan&filter[content_plan][_null]=true&limit=-1`,
  )
  if (!posts?.length) {
    console.log('  ✓ no unbucketed posts')
    return
  }
  console.log(`  ${posts.length} posts to bucket`)
  const buckets = new Map<string, PostRow[]>()
  for (const p of posts) {
    const k = bucketKey(p.organization, p.target_month)
    const arr = buckets.get(k) ?? []
    arr.push(p)
    buckets.set(k, arr)
  }
  console.log(`  ${buckets.size} bucket(s):`)
  for (const [k, rows] of buckets) {
    const [org, month] = k.split('::')
    console.log(`    org=${org.slice(0, 8)}… month=${month === '_null' ? '(none)' : month} → ${rows.length} post(s)`)
  }

  let attached = 0
  for (const [k, rows] of buckets) {
    const [org, monthRaw] = k.split('::')
    const month = monthRaw === '_null' ? null : monthRaw
    const planId = await findOrCreatePlan(org, month)
    if (!planId) {
      console.error(`  ✗ skipping bucket ${k} (no plan id)`)
      continue
    }
    for (const post of rows) {
      console.log(`    ${tag('PATCH')} post ${post.id.slice(0, 8)}… → plan ${planId}`)
      if (APPLY) {
        const { error } = await dx(`/items/social_posts/${post.id}`, 'PATCH', { content_plan: planId })
        if (error) console.error(`    ✗ ${error}`)
        else attached += 1
      }
    }
  }
  console.log(`\n  total posts attached (dry run shows 0): ${attached}`)
}

async function main() {
  console.log('\n── Content Plans Backfill ──')
  console.log(`Directus: ${DIRECTUS_URL}`)
  console.log(`Mode:     ${APPLY ? 'APPLY (mutating)' : 'DRY RUN (re-run with --apply to write)'}`)

  await relaxProject()
  await addOrganization()
  await backfillPosts()

  console.log('\n── Done ──\n')
  if (!APPLY) {
    console.log('Re-run with --apply to perform the mutations above.\n')
  } else {
    console.log('Next: pnpm generate:types')
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
