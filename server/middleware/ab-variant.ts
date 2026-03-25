// server/middleware/ab-variant.ts
/**
 * A/B test variant assignment middleware.
 *
 * On every request, checks for an `earnest_ab` cookie.
 * If missing, randomly assigns a variant and sets the cookie.
 * Injects the variant into the event context so pages/composables can read it.
 *
 * Cookie is sticky for 30 days — same visitor always sees the same variant.
 */

export default defineEventHandler((event) => {
	const cookieName = 'earnest_ab';
	const validVariants = ['a', 'b'];

	// Read existing cookie
	let variant = getCookie(event, cookieName);

	// Assign if missing or invalid
	if (!variant || !validVariants.includes(variant)) {
		variant = Math.random() < 0.5 ? 'a' : 'b';
		setCookie(event, cookieName, variant, {
			maxAge: 60 * 60 * 24 * 30, // 30 days
			path: '/',
			sameSite: 'lax',
			httpOnly: false, // client needs to read it
		});
	}

	// Make available to SSR context
	event.context.abVariant = variant;
});
