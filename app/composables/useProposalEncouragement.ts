/**
 * useProposalEncouragement — positive reinforcement while Camila (and everyone
 * else) works through a stack of proposals/contracts in one sitting.
 *
 * Fires a celebratory toast with copy that escalates as more go out in the same
 * session, pops confetti on milestones + wins, and gives a haptic tick. The
 * session counter is module-level so it persists across the many form-modal
 * instances a person opens and closes while entering documents.
 */

// Module-scoped so every FormModal instance shares one running tally.
const sentThisSession = ref(0);

type CelebrateOpts = {
	/** The document's status after save — 'accepted'/'signed' get a bigger moment. */
	status?: string | null;
	/** Override the noun in the copy (defaults to 'proposal'). */
	noun?: string;
};

const FIRST_LINES = [
	'out the door 🚀 — nicely done.',
	"logged. That's momentum.",
	'sent. One more step toward the win.',
];

// Indexed loosely by how many have gone out this session.
function streakLine(count: number, noun: string): { title: string; description?: string } {
	if (count <= 1) return { title: `${cap(noun)} ${pick(FIRST_LINES, count)}` };
	if (count === 2) return { title: 'Two down 👏', description: "You're on a roll — keep them coming." };
	if (count === 3) return { title: 'Three today 🔥', description: 'Momentum looks good on you.' };
	if (count <= 5) return { title: `${count} ${noun}s out 💪`, description: 'This is what a strong pipeline looks like.' };
	return { title: `${count} and counting 🌟`, description: 'Unstoppable. Future-you says thanks.' };
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(seed) % arr.length]; }

export function useProposalEncouragement() {
	const toast = useToast();
	const { celebrate } = useConfetti();
	let haptic: ((k?: string) => void) | undefined;
	try { haptic = useFeedback?.().haptic; } catch { /* useFeedback not always present */ }

	function fire(opts: CelebrateOpts = {}) {
		const noun = opts.noun || 'proposal';
		const status = (opts.status || '').toLowerCase();
		const isWin = status === 'accepted' || status === 'signed';

		sentThisSession.value += 1;
		const count = sentThisSession.value;

		if (isWin) {
			toast.add({ title: `Accepted! 🎉`, description: `That ${noun} is a win — logged and celebrated.`, color: 'green' });
		} else {
			const line = streakLine(count, noun);
			toast.add({ title: line.title, description: line.description, color: 'green' });
		}

		// Confetti on a win, the first of the session, and every third after —
		// enough to feel rewarding without turning into noise.
		if (isWin || count === 1 || count % 3 === 0) celebrate();
		haptic?.('success');
	}

	return {
		sentThisSession: readonly(sentThisSession),
		celebrateProposal: (opts: CelebrateOpts = {}) => fire({ ...opts, noun: 'proposal' }),
		celebrateContract: (opts: CelebrateOpts = {}) => fire({ ...opts, noun: 'contract' }),
	};
}
