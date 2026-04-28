/**
 * Heuristic spam/junk detection for inbound leads and contacts.
 *
 * Designed for two callers:
 *   1. Public lead-submission endpoints — score-then-reject (or score-then-flag)
 *      before persisting. Pair with a CAPTCHA (hCaptcha / Turnstile) for
 *      defense-in-depth.
 *   2. The `audit-junk-leads.ts` sweep script — back-fills `is_junk: true` on
 *      existing rows that match.
 *
 * The scoring function is intentionally conservative: a single weak signal
 * (e.g. a short name) doesn't trigger; multiple signals must stack. False
 * positives are worse than false negatives here because legitimate leads are
 * the entire business.
 */

const DISPOSABLE_DOMAINS = new Set([
	'mailinator.com',
	'guerrillamail.com',
	'10minutemail.com',
	'tempmail.com',
	'temp-mail.org',
	'throwawaymail.com',
	'yopmail.com',
	'fakeinbox.com',
	'getairmail.com',
	'maildrop.cc',
	'sharklasers.com',
	'trashmail.com',
	'mintemail.com',
	'spam4.me',
	'getnada.com',
]);

const KEYBOARD_RUNS = /qwerty|asdf|zxcv|qwer|asdfgh|zxcvbn|1234|abcd/i;

const TEST_TOKENS = /\b(test|sample|lorem|ipsum|pariatur|dolor|consectetur)\b/i;

interface Candidate {
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	notes?: string | null;
	company?: string | null;
}

export interface JunkScore {
	score: number;
	reasons: string[];
	isJunk: boolean;
}

const isLikelyRandomString = (s: string): boolean => {
	const cleaned = s.replace(/[^a-z]/gi, '');
	if (cleaned.length < 6) return false;
	const vowels = (cleaned.match(/[aeiouAEIOU]/g) || []).length;
	const ratio = vowels / cleaned.length;
	if (ratio < 0.18) return true;
	if (cleaned.length >= 16 && /[A-Z]{4,}/.test(cleaned)) return true;
	if (cleaned.length >= 8 && /^[A-Z][a-z]+[A-Z]/.test(cleaned) === false && /[A-Z][a-z]*[A-Z]/.test(cleaned)) return true;
	return false;
};

export function scoreJunk(candidate: Candidate): JunkScore {
	const reasons: string[] = [];
	let score = 0;

	const fullName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim();
	const email = (candidate.email || '').trim().toLowerCase();
	const notes = (candidate.notes || '').trim();
	const company = (candidate.company || '').trim();

	if (fullName) {
		if (isLikelyRandomString(fullName)) {
			score += 4;
			reasons.push('name looks random');
		}
		if (KEYBOARD_RUNS.test(fullName)) {
			score += 3;
			reasons.push('name has keyboard run');
		}
		if (TEST_TOKENS.test(fullName)) {
			score += 2;
			reasons.push('name contains test/lorem token');
		}
	}

	if (email) {
		const domain = email.split('@')[1] || '';
		if (DISPOSABLE_DOMAINS.has(domain)) {
			score += 5;
			reasons.push(`disposable email domain (${domain})`);
		}
		const localPart = email.split('@')[0] || '';
		if (isLikelyRandomString(localPart) && localPart.length >= 12) {
			score += 2;
			reasons.push('email local-part looks random');
		}
		if (TEST_TOKENS.test(email)) {
			score += 1;
			reasons.push('email contains test token');
		}
	} else {
		score += 1;
		reasons.push('no email');
	}

	if (notes && (TEST_TOKENS.test(notes) || isLikelyRandomString(notes.slice(0, 50)))) {
		score += 2;
		reasons.push('notes look random or test-y');
	}

	if (company && TEST_TOKENS.test(company)) {
		score += 1;
		reasons.push('company contains test token');
	}

	return {
		score,
		reasons,
		isJunk: score >= 5,
	};
}
