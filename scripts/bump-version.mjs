#!/usr/bin/env node
/**
 * bump-version.mjs — create the next version TAG.
 *
 * The in-app version is auto-counted from git at build time
 * (nuxt.config.ts → resolveAppVersion): it's MAJOR.MINOR.<commits-since-tag>,
 * where the MAJOR.MINOR base is the most recent `vX.Y` tag and the PATCH climbs
 * by itself on every push. So a "release" is just tagging a new MAJOR.MINOR —
 * the patch resets to 0 and counts up from there. You never edit package.json.
 *
 * This helper reads the latest `vX.Y` tag and creates the next one:
 *
 *   node scripts/bump-version.mjs minor     # v2.0 → v2.1   (new feature line)
 *   node scripts/bump-version.mjs major     # v2.3 → v3.0   (breaking / new era)
 *   node scripts/bump-version.mjs v2.5      # explicit tag
 *   node scripts/bump-version.mjs minor --dry-run   # preview, change nothing
 *
 * Does NOT push — it prints the push command so you stay in control of when
 * the new version actually ships. (Pushing the tag, or any later commit, is
 * what makes Vercel rebuild with the new number.)
 */
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const bump = (positional[0] || 'minor').toLowerCase();
const dryRun = flags.has('--dry-run');

function sh(cmd) {
	return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

// Most recent vMAJOR.MINOR tag (ignore the legacy *-archive tag).
let latest = '';
try {
	latest = sh("git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*archive*'");
} catch {
	// no tags yet — start from v0.0
}

const m = latest.match(/^v?(\d+)\.(\d+)/);
const major = m ? Number(m[1]) : 0;
const minor = m ? Number(m[2]) : 0;

let next;
if (/^v?\d+\.\d+$/.test(bump)) {
	next = bump.startsWith('v') ? bump : `v${bump}`; // explicit
} else if (bump === 'major') {
	next = `v${major + 1}.0`;
} else if (bump === 'minor') {
	next = `v${major}.${minor + 1}`;
} else {
	console.error(`✗ Unknown bump "${bump}". Use: minor | major | vX.Y`);
	process.exit(1);
}

console.log(`Latest tag: ${latest || '(none)'}  →  ${next}  (${bump})`);

if (dryRun) {
	console.log('Dry run — nothing created.');
	process.exit(0);
}

try {
	execSync(`git tag -a "${next}" -m "${next}"`, { stdio: 'inherit' });
	console.log(`✓ Created tag ${next} on HEAD`);
	console.log(`\nTo ship it:\n  git push origin ${next}`);
} catch (err) {
	console.error('\n✗ Failed to create tag:');
	console.error(`  ${err.message}`);
	process.exit(1);
}
