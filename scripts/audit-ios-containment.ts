#!/usr/bin/env npx tsx
/**
 * Apps-layout containment audit. Part of the universal iOS UX sweep
 * (primitive #6 — apps content lives inside the `/apps/*` shell, zero
 * punch-outs to legacy routes).
 *
 * Fails if any file under app/pages/apps or app/components/apps contains
 * a navigation call (`router.push`, `router.replace`, `navigateTo`,
 * `<NuxtLink to="…">`, `<NuxtLink :to="…">`, plain `<a href="…">`) that
 * targets a route OUTSIDE the apps tree — UNLESS the same line or one of
 * the five preceding lines carries a `// TODO(ios-sweep): …` marker or a
 * `// allow-legacy-link` escape hatch.
 *
 * Allowed targets (treated as "inside the shell"):
 *   - `/apps/...`
 *   - `/portal/...` (separate first-class app surface)
 *   - `/auth/...`   (sign-in flow)
 *   - `/api/...`    (server routes used for fetch only — never navigation)
 *   - `/share/...`  (public share links)
 *   - relative paths (`./`, `../`)
 *   - dynamic / computed paths (path variables — flagged by reviewer manually)
 *
 * Usage:
 *
 *   pnpm tsx scripts/audit-ios-containment.ts          # report mode
 *   pnpm tsx scripts/audit-ios-containment.ts --json   # machine-readable
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCAN_DIRS = ['app/pages/apps', 'app/components/apps'];
const TODO_MARKER = /(\/\/|<!--).*?(TODO\(ios-sweep\)|allow-legacy-link)/;
const MARKER_LOOKBACK = 8;

const NAV_PATTERNS: Array<{ re: RegExp; kind: string }> = [
  { re: /router\s*\.\s*(push|replace)\s*\(\s*[`'"](\/[^`'")]+)/g, kind: 'router' },
  { re: /navigateTo\s*\(\s*[`'"](\/[^`'")]+)/g, kind: 'navigateTo' },
  { re: /<NuxtLink[^>]*\s:?to\s*=\s*"(\/[^"]+)"/g, kind: 'NuxtLink' },
  { re: /<a[^>]*\shref\s*=\s*"(\/[^"]+)"/g, kind: '<a>' },
];

const INSIDE_SHELL = (p: string) => {
  if (!p.startsWith('/')) return true;
  return (
    p.startsWith('/apps/') ||
    p === '/apps' ||
    p.startsWith('/portal/') ||
    p === '/portal' ||
    p.startsWith('/auth/') ||
    p.startsWith('/api/') ||
    p.startsWith('/share/')
  );
};

interface Hit {
  file: string;
  line: number;
  kind: string;
  target: string;
  context: string;
  tagged: boolean;
  tag?: string;
}

function listFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    try {
      const out = execSync(`find ${dir} -type f \\( -name '*.vue' -o -name '*.ts' -o -name '*.js' \\)`, {
        cwd: ROOT,
        encoding: 'utf8',
      });
      for (const f of out.split('\n').map((s) => s.trim()).filter(Boolean)) {
        files.push(f);
      }
    } catch {
      /* ignore — dir may not exist in some checkouts */
    }
  }
  return files;
}

function audit(file: string): Hit[] {
  const text = readFileSync(path.join(ROOT, file), 'utf8');
  const lines = text.split('\n');
  const hits: Hit[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    for (const { re, kind } of NAV_PATTERNS) {
      // Reset state on each iteration since we re-use the global regex.
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        // Captured the target as the last capture group regardless of which
        // pattern matched (router.push has 2 groups, others have 1).
        const target = m[m.length - 1]!;
        if (INSIDE_SHELL(target)) continue;

        // Walk back up to MARKER_LOOKBACK lines (inclusive of current) for a marker.
        let tagged = false;
        let tagMatched: string | undefined;
        for (let back = 0; back <= MARKER_LOOKBACK; back++) {
          const probe = lines[idx - back];
          if (!probe) continue;
          const tag = probe.match(TODO_MARKER);
          if (tag) {
            tagged = true;
            tagMatched = tag[0];
            break;
          }
        }

        hits.push({
          file,
          line: idx + 1,
          kind,
          target,
          context: line.trim().slice(0, 160),
          tagged,
          tag: tagMatched,
        });
      }
    }
  }
  return hits;
}

const json = process.argv.includes('--json');

const files = listFiles();
const allHits: Hit[] = [];
for (const f of files) {
  for (const h of audit(f)) allHits.push(h);
}

const liftNow = allHits.filter((h) => !h.tagged);
const slideOver = allHits.filter((h) => h.tagged);

if (json) {
  process.stdout.write(
    JSON.stringify({ liftNow, slideOver, totals: { liftNow: liftNow.length, slideOver: slideOver.length } }, null, 2),
  );
  process.exit(liftNow.length === 0 ? 0 : 1);
}

if (liftNow.length > 0) {
  console.error('✗ Apps-layout containment audit FAILED');
  console.error('');
  console.error(`Found ${liftNow.length} untagged punch-out${liftNow.length === 1 ? '' : 's'} from /apps/* to a legacy route.`);
  console.error('Each hit must EITHER be lifted into the apps shell, OR carry a comment like:');
  console.error('  // TODO(ios-sweep): lift to <Entity>Panel slide-over');
  console.error('  // allow-legacy-link     ← only for genuine deep-link receivers');
  console.error('on the same line or within 5 lines above.');
  console.error('');
  for (const h of liftNow) {
    console.error(`  ${h.file}:${h.line}  [${h.kind} → ${h.target}]`);
    console.error(`    ${h.context}`);
  }
  process.exit(1);
}

console.log('✓ Apps-layout containment audit passed');
console.log(`  Scanned ${files.length} files under app/pages/apps + app/components/apps.`);
console.log(`  ${slideOver.length} known punch-out${slideOver.length === 1 ? '' : 's'} tagged for P2-P7 sweep (TODO(ios-sweep) markers).`);
if (slideOver.length > 0 && process.argv.includes('--verbose')) {
  console.log('');
  for (const h of slideOver) {
    console.log(`  ${h.file}:${h.line}  [${h.kind} → ${h.target}]`);
  }
}
