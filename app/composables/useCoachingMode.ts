/**
 * useCoachingMode — compatibility shim over useEarnest.
 *
 * "Focus mode" is now simply Earnest at size 'full': the same conversation as
 * the docked panel, shown full-screen in the calm "one honest thing" register.
 * Opening it changes the size, it does NOT start a separate thread — context is
 * derived from useEarnestAwareness like every other size, so the thread carries
 * across dock ⇄ full.
 *
 * `scope` is retained for back-compat with the current CoachingTakeover
 * renderer; the unified overlay reads live route/entity context from awareness.
 */
import { earnestMode, openEarnest, closeEarnest } from '~/composables/useEarnest';

export interface CoachingScope {
	mode: 'org' | 'entity';
	/** Plural collection for a focused session (e.g. 'projects', 'clients'). */
	entityType?: string;
	entityId?: string;
	/** Human label for the header (e.g. the project title). */
	label?: string;
	/** Optional opening line to seed the conversation. */
	opener?: string;
}

export function useCoachingMode() {
	const scope = useState<CoachingScope | null>('coaching-mode-scope', () => null);
	const isOpen = computed(() => earnestMode.value === 'full');

	function open(next?: CoachingScope) {
		scope.value = next ?? { mode: 'org' };
		openEarnest('full', next?.opener ? { prompt: next.opener } : {});
	}
	function close() {
		if (earnestMode.value === 'full') closeEarnest();
	}
	function toggle(next?: CoachingScope) {
		if (isOpen.value) close();
		else open(next);
	}

	return { isOpen, scope, open, close, toggle };
}
