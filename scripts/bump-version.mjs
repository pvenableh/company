#!/usr/bin/env node
/**
 * bump-version.mjs — bump the MAJOR.MINOR version line.
 *
 * The in-app version is MAJOR.MINOR.<total-commit-count>, resolved at build
 * time (nuxt.config.ts → resolveAppVersion). MAJOR.MINOR is read from
 * package.json's "version"; the PATCH is `git rev-list --count HEAD`, which
 * climbs by itself on every push. So a "release" is just bumping MAJOR.MINOR in
 * package.json — the patch keeps counting commits from there.
 *
 *   node scripts/bump-version.mjs minor     # 2.0.x → 2.1.0   (new feature line)
 *   node scripts/bump-version.mjs major     # 2.3.x → 3.0.0   (breaking / new era)
 *   node scripts/bump-version.mjs 2.5       # explicit MAJOR.MINOR
 *   node scripts/bump-version.mjs minor --dry-run   # preview, change nothing
 *
 * Writes package.json and creates a matching `vX.Y` git tag (kept only as a
 * reference / changelog anchor — the tag no longer drives the build number).
 * Does NOT commit or push: it prints the next steps so you stay in control of
 * when the new number ships. (Committing the package.json bump — or any later
 * commit — is what makes Vercel rebuild with the new number.)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const bump = (positional[0] || 'minor').toLowerCase();
const dryRun = flags.has('--dry-run');

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const raw = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

const cur = String(pkg.version || '0.0.0').match(/^(\d+)\.(\d+)/);
const major = cur ? Number(cur[1]) : 0;
const minor = cur ? Number(cur[2]) : 0;

let nextMajor;
let nextMinor;
if (/^v?\d+\.\d+$/.test(bump)) {
	const m = bump.replace(/^v/, '').split('.');
	nextMajor = Number(m[0]);
	nextMinor = Number(m[1]);
} else if (bump === 'major') {
	nextMajor = major + 1;
	nextMinor = 0;
} else if (bump === 'minor') {
	nextMajor = major;
	nextMinor = minor + 1;
} else {
	console.error(`✗ Unknown bump "${bump}". Use: minor | major | X.Y`);
	process.exit(1);
}

const nextVersion = `${nextMajor}.${nextMinor}.0`;
const nextTag = `v${nextMajor}.${nextMinor}`;
console.log(`Current: ${pkg.version}  →  ${nextVersion}  (tag ${nextTag}, ${bump})`);

if (dryRun) {
	console.log('Dry run — nothing changed.');
	process.exit(0);
}

// Targeted replace preserves the file's exact formatting (tabs, key order).
const nextRaw = raw.replace(/("version":\s*")[^"]+(")/, `$1${nextVersion}$2`);
if (nextRaw === raw) {
	console.error('✗ Could not find "version" in package.json — aborting.');
	process.exit(1);
}
writeFileSync(pkgPath, nextRaw);
console.log(`✓ Wrote package.json version ${nextVersion}`);

try {
	execSync(`git tag -a "${nextTag}" -m "${nextTag}"`, { stdio: 'inherit' });
	console.log(`✓ Created tag ${nextTag} on HEAD`);
} catch (err) {
	console.warn(`(tag ${nextTag} not created — ${err.message})`);
}

console.log(
	`\nTo ship it:\n  git add package.json && git commit -m "chore(release): ${nextVersion}"\n  git push && git push origin ${nextTag}`,
);
