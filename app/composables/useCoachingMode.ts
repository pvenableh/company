/**
 * useCoachingMode — shared open/close state for the Earnest coaching takeover
 * (app/components/Earnest/CoachingTakeover.vue, mounted once in app.vue).
 *
 * A calm, full-screen "focus mode" that simplifies the screen down to a single
 * conversational flow with Earnest — for when the command center or a busy
 * project page feels overwhelming. Opens *over* the current page and closes
 * back to it, so this is deliberately global state, not a route.
 *
 * Scope mirrors useDirectorOffice: an org-wide check-in, or a focused walk
 * through one entity (project / task / client / …).
 */
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
	const isOpen = useState<boolean>('coaching-mode-open', () => false);
	const scope = useState<CoachingScope | null>('coaching-mode-scope', () => null);

	function open(next?: CoachingScope) {
		scope.value = next ?? { mode: 'org' };
		isOpen.value = true;
	}
	function close() {
		isOpen.value = false;
	}
	function toggle(next?: CoachingScope) {
		if (isOpen.value) close();
		else open(next);
	}

	return { isOpen, scope, open, close, toggle };
}
