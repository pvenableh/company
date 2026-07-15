#!/usr/bin/env npx tsx
/**
 * Vue `:global()` selector audit.
 *
 * In <style scoped>, the SFC compiler treats ONLY the argument of
 * `:global(...)` as unscoped and SILENTLY DROPS everything after it:
 *
 *   :global(.dark) .lane-chip { … }   →  compiles to just `.dark { … }`
 *
 * Two failures in one: the intended rule never applies, and the style
 * leaks onto the global ancestor (we shipped a primary gradient painted
 * onto <html> this way). The correct form wraps the WHOLE selector:
 *
 *   :global(.dark .lane-chip) { … }   →  `.dark .lane-chip { … }`
 *
 * This audit fails the commit when any `.vue` file contains `:global(...)`
 * followed by anything other than `{`, `,`, or another `:global(`. Found
 * and fixed 11 instances on 2026-07-15.
 *
 * Usage:
 *   pnpm tsx scripts/audit-vue-global-selectors.ts          # report mode
 *   pnpm tsx scripts/audit-vue-global-selectors.ts --json   # machine-readable
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// `:global( … )` then, after optional whitespace, something that is NOT
// `{` (rule opens — fine), `,` (next selector in a list — fine), or the
// start of another pseudo like `:global(`/`:hover` chains (still broken,
// but flag those too by only allowing `{` and `,`).
const BAD = /:global\([^)]*\)\s*(?![\s]*[,{])/;

const files = execSync('git ls-files "app/**/*.vue" "layouts/**/*.vue"', { cwd: ROOT })
	.toString()
	.split('\n')
	.filter(Boolean);

interface Finding {
	file: string;
	line: number;
	text: string;
}

const findings: Finding[] = [];
for (const file of files) {
	const src = readFileSync(path.join(ROOT, file), 'utf8');
	if (!src.includes(':global(')) continue;
	const lines = src.split('\n');
	lines.forEach((text, i) => {
		if (text.includes(':global(') && BAD.test(text)) {
			findings.push({ file, line: i + 1, text: text.trim().slice(0, 120) });
		}
	});
}

const json = process.argv.includes('--json');
if (findings.length === 0) {
	if (json) console.log('[]');
	else console.log('✓ vue :global() audit clean — no truncated-selector usages.');
	process.exit(0);
}

if (json) {
	console.log(JSON.stringify(findings, null, 2));
} else {
	console.error(`✗ ${findings.length} broken :global() usage(s) — the compiler drops everything after :global(...).`);
	console.error('  Fix by wrapping the WHOLE selector: :global(.dark) .foo  →  :global(.dark .foo)\n');
	for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.text}`);
}
process.exit(1);
