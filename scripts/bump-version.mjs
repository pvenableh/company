#!/usr/bin/env node
/**
 * bump-version.mjs — MANUAL FALLBACK version bump (release-please is primary).
 *
 * Normal releases are automated by release-please (.github/workflows/
 * release-please.yml): land Conventional-Commit messages on main, merge the
 * Release PR it opens, done. Use THIS script only for an out-of-band bump
 * (e.g. a hotfix you tag locally). It keeps `.release-please-manifest.json` in
 * sync with package.json so the two never disagree about the current version.
 *
 * The version shown in-app (About panel + avatar menu) is baked from
 * package.json at build time, so a release is just: bump → commit → push →
 * Vercel builds and the new version goes live. This script does the first two
 * steps in one shot.
 *
 * Usage:
 *   node scripts/bump-version.mjs            # patch  1.2.3 → 1.2.4 (default)
 *   node scripts/bump-version.mjs patch      # 1.2.3 → 1.2.4  (bug fixes)
 *   node scripts/bump-version.mjs minor      # 1.2.3 → 1.3.0  (new features)
 *   node scripts/bump-version.mjs major      # 1.2.3 → 2.0.0  (breaking changes)
 *   node scripts/bump-version.mjs 2.5.0      # set an explicit version
 *   node scripts/bump-version.mjs minor --no-git   # edit package.json only
 *   node scripts/bump-version.mjs major --dry-run  # preview, change nothing
 *
 * Flags:
 *   --no-git    Only rewrite package.json (skip the commit + tag).
 *   --dry-run   Print what would happen; touch nothing.
 *
 * Does NOT push — it prints the push command so you stay in control of when
 * the release actually ships.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const manifestPath = join(root, '.release-please-manifest.json');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const bump = (positional[0] || 'patch').toLowerCase();
const noGit = flags.has('--no-git');
const dryRun = flags.has('--dry-run');

const raw = readFileSync(pkgPath, 'utf8');
const match = raw.match(/"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!match) {
	console.error('✗ Could not find a "version": "x.y.z" in package.json');
	process.exit(1);
}

const [major, minor, patch] = match.slice(1, 4).map(Number);
const current = `${major}.${minor}.${patch}`;

let next;
if (/^\d+\.\d+\.\d+$/.test(bump)) {
	next = bump; // explicit version
} else if (bump === 'major') {
	next = `${major + 1}.0.0`;
} else if (bump === 'minor') {
	next = `${major}.${minor + 1}.0`;
} else if (bump === 'patch') {
	next = `${major}.${minor}.${patch + 1}`;
} else {
	console.error(`✗ Unknown bump "${bump}". Use: major | minor | patch | x.y.z`);
	process.exit(1);
}

if (next === current) {
	console.error(`✗ New version equals current (${current}); nothing to do.`);
	process.exit(1);
}

console.log(`Version: ${current} → ${next}  (${bump})`);

if (dryRun) {
	console.log('Dry run — nothing written.');
	process.exit(0);
}

// Targeted replace preserves the rest of package.json exactly (tabs, order).
const updated = raw.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`);
writeFileSync(pkgPath, updated);
console.log('✓ package.json updated');

// Keep the release-please manifest in lock-step so automated + manual bumps
// never disagree about the baseline.
const commitPaths = ['package.json'];
try {
	const manifestRaw = readFileSync(manifestPath, 'utf8');
	const manifest = JSON.parse(manifestRaw);
	if (manifest['.'] !== undefined) {
		manifest['.'] = next;
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
		commitPaths.push('.release-please-manifest.json');
		console.log('✓ .release-please-manifest.json synced');
	}
} catch {
	// No manifest (or unreadable) — fine, package.json is the source of truth.
}

if (noGit) {
	console.log('Skipped git (--no-git). Remember to commit the bump for it to ship.');
	process.exit(0);
}

try {
	// Path-limited commit so we never sweep in unrelated staged changes.
	execSync(`git commit -m "chore(release): v${next}" -- ${commitPaths.join(' ')}`, {
		cwd: root,
		stdio: 'inherit',
	});
	execSync(`git tag -a "v${next}" -m "v${next}"`, { cwd: root, stdio: 'inherit' });
	console.log(`✓ Committed + tagged v${next}`);
	console.log('\nTo ship it:\n  git push && git push --tags');
} catch (err) {
	console.error('\n✗ Git step failed (rerun with --no-git to bump the file only):');
	console.error(`  ${err.message}`);
	process.exit(1);
}
