// scripts/mint-invite-link.ts
// Dev/QA helper: given a pending org_memberships or client_portal_users row id,
// print a ready-to-click branded accept-invite URL (signed, expiring) — the
// same link the invite email carries. Lets QA test the accept flow without
// depending on live email delivery.
//
//   tsx scripts/mint-invite-link.ts <membershipId> [baseUrl]
import 'dotenv/config';
import { signInviteToken } from '../server/utils/invite-token';

const membershipId = process.argv[2];
const base = (process.argv[3] || 'http://127.0.0.1:3000').replace(/\/$/, '');

if (!membershipId) {
	console.error('usage: tsx scripts/mint-invite-link.ts <membershipId> [baseUrl]');
	process.exit(1);
}

const token = signInviteToken(membershipId);
console.log(`${base}/auth/accept-org-invite?membership=${membershipId}&invite_token=${encodeURIComponent(token)}`);
