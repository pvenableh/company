#!/usr/bin/env npx tsx
/**
 * Adoption digest over `product_events` (see reference_product_events_telemetry
 * / project_presence_home). Read-only — queries with the admin token and prints
 * a summary. No reporting UI yet; run this until there's enough data to warrant one.
 *
 *   pnpm tsx scripts/report-product-events.ts            # last 30 days
 *   pnpm tsx scripts/report-product-events.ts --days 7   # last 7 days
 *   pnpm tsx scripts/report-product-events.ts --all      # all time
 *   pnpm tsx scripts/report-product-events.ts --event home.mode_flipped
 */
import 'dotenv/config';

interface Row {
  event: string;
  user: string | null;
  props: Record<string, unknown> | null;
  date_created: string;
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? '') : null;
}

async function main() {
  const URL = process.env.DIRECTUS_URL;
  const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
  if (!URL || !TOKEN) { console.error('DIRECTUS_URL + DIRECTUS_SERVER_TOKEN/ADMIN_TOKEN required'); process.exit(1); }

  const all = process.argv.includes('--all');
  const days = Number(arg('--days') ?? 30);
  const onlyEvent = arg('--event');

  const params = new URLSearchParams({ limit: '-1', sort: '-date_created', fields: 'event,user,props,date_created' });
  if (!all) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    params.set('filter[date_created][_gte]', since);
  }
  if (onlyEvent) params.set('filter[event][_eq]', onlyEvent);

  const r = await fetch(`${URL}/items/product_events?${params}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) { console.error('query failed', r.status, await r.text()); process.exit(1); }
  const rows: Row[] = (await r.json()).data ?? [];

  const window = all ? 'all time' : `last ${days}d`;
  console.log(`\n📊 product_events — ${window}  (${rows.length} events)\n`);
  if (!rows.length) { console.log('  (no events yet)\n'); return; }

  const users = new Set(rows.map((x) => x.user).filter(Boolean));
  const first = rows[rows.length - 1]?.date_created?.slice(0, 10);
  const last = rows[0]?.date_created?.slice(0, 10);
  console.log(`  span: ${first} → ${last}   unique users: ${users.size}\n`);

  // Counts per event (+ unique users per event).
  const byEvent = new Map<string, { n: number; users: Set<string> }>();
  for (const x of rows) {
    const e = byEvent.get(x.event) ?? { n: 0, users: new Set<string>() };
    e.n++; if (x.user) e.users.add(x.user);
    byEvent.set(x.event, e);
  }
  console.log('  by event:');
  for (const [ev, { n, users: us }] of [...byEvent].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`    ${ev.padEnd(28)} ${String(n).padStart(5)}   (${us.size} users)`);
  }
  console.log('');

  // Adoption: presence↔classic flips.
  const flips = rows.filter((x) => x.event === 'home.mode_flipped');
  if (flips.length) {
    const toClassic = flips.filter((x) => x.props?.to === 'classic').length;
    const toPresence = flips.filter((x) => x.props?.to === 'presence').length;
    console.log('  adoption (home.mode_flipped):');
    console.log(`    → classic (opted out):  ${toClassic}`);
    console.log(`    → presence (opted in):  ${toPresence}`);
    console.log(`    net:                    ${toPresence - toClassic >= 0 ? '+' : ''}${toPresence - toClassic} toward presence\n`);
  }

  // Continue-chip funnel.
  const shown = byEvent.get('home.continue_shown')?.n ?? 0;
  const resumed = byEvent.get('home.continue_resumed')?.n ?? 0;
  if (shown || resumed) {
    const rate = shown ? Math.round((resumed / shown) * 100) : 0;
    console.log('  continue chip:');
    console.log(`    shown: ${shown}   resumed: ${resumed}   resume rate: ${rate}%\n`);
  }

  // Engagement.
  const convos = byEvent.get('home.conversation_started');
  const reveals = byEvent.get('home.reveal')?.n ?? 0;
  console.log('  engagement:');
  console.log(`    conversations started: ${convos?.n ?? 0}  (${convos?.users.size ?? 0} users)`);
  console.log(`    command-center reveals: ${reveals}\n`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
