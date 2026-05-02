#!/usr/bin/env npx tsx
/**
 * Meta App Review — reviewer login
 *
 * Provisions a stable test login for Meta's app-review team:
 *   email:    contact@huestudios.com
 *   password: Password1
 *
 * The user is granted Member access to the existing "Earnest Demo — Solo"
 * org (same workspace public /try-demo visitors see), so reviewers can
 * exercise the full app against realistic seed data.
 *
 * Idempotent — re-running resets the password and re-asserts membership.
 *
 * Per Meta's submission policy, credentials must remain active for one
 * year after submission.
 *
 * Usage: pnpm tsx scripts/setup-meta-reviewer-user.ts
 */

import 'dotenv/config';
import {
	assertDirectusToken,
	directusRequest,
	ensureMembership,
	ensureUser,
	findOne,
	pingDirectus,
} from './lib/demo-seed';

const REVIEWER_EMAIL = 'contact@huestudios.com';
const REVIEWER_PASSWORD = 'Password1';
const REVIEWER_FIRST = 'Meta';
const REVIEWER_LAST = 'Reviewer';

const TARGET_ORG_SLUG = 'earnest-demo-solo';

assertDirectusToken();

async function main() {
	console.log('=========================================');
	console.log('  Meta App Review — reviewer user setup');
	console.log('=========================================');
	console.log(`Target: ${process.env.DIRECTUS_URL || 'http://localhost:8055'}\n`);

	await pingDirectus();

	console.log('--- locate target org ---');
	const org = await findOne<any>('organizations', { slug: { _eq: TARGET_ORG_SLUG } });
	if (!org) {
		console.error(`Could not find org with slug "${TARGET_ORG_SLUG}".`);
		console.error('Run scripts/setup-demo-org.ts first.');
		process.exit(1);
	}
	console.log(`  [ok]   org "${org.name}" (id=${org.id})`);

	console.log('\n--- locate Member role for org ---');
	const memberRole = await findOne<any>('org_roles', {
		_and: [{ organization: { _eq: org.id } }, { slug: { _eq: 'member' } }],
	});
	if (!memberRole) {
		console.error('No Member role on the demo org — re-run setup-demo-org.ts to seed roles.');
		process.exit(1);
	}
	console.log(`  [ok]   role member (id=${memberRole.id})`);

	console.log('\n--- reviewer user ---');
	const user = await ensureUser({
		email: REVIEWER_EMAIL,
		password: REVIEWER_PASSWORD,
		firstName: REVIEWER_FIRST,
		lastName: REVIEWER_LAST,
	});
	if (!user) process.exit(1);

	console.log('\n--- membership ---');
	await ensureMembership(org.id, user.id, memberRole.id, 'meta reviewer → Member');

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  Org:      ${org.name} (${org.id})`);
	console.log(`  User ID:  ${user.id}`);
	console.log(`  Email:    ${REVIEWER_EMAIL}`);
	console.log(`  Password: ${REVIEWER_PASSWORD}`);
	console.log('\nDone.');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
