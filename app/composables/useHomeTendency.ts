// composables/useHomeTendency.ts
//
// Learn how the user actually uses the presence home. If they reach for the
// command center ("Everything") on most of their recent visits, the calm hero
// is getting in their way — so on the next visit Earnest pre-reveals it for
// them. If they then say "start calm" (override the auto-reveal), that vote is
// recorded too, so the habit decays when it stops fitting. Purely a local
// behavioural heuristic — device-local is the right grain for "how do I use
// this machine," so it lives in localStorage, not a synced pref.
//
// One outcome per session, upgradable within the session:
//   noteVisit()   → provisional `false` (a calm visit) — set once, won't clobber
//   recordReveal()→ `true`  (engaged the command center; upgrades the session)
//   startCalm()   → `false` (overrode an auto-reveal; downgrades the session)

const KEY = 'earnest.home.tendency.v1';
const WINDOW = 5; // remember the last N distinct sessions
const THRESHOLD = 3; // ≥ this many "density" sessions in the window → auto-reveal

interface TendencyState {
	sessions: boolean[]; // most-recent-first; true = engaged the command center
	recordedSession: string | null; // session already logged (one entry per visit)
}

function read(): TendencyState {
	if (import.meta.server) return { sessions: [], recordedSession: null };
	try {
		const p = JSON.parse(localStorage.getItem(KEY) || '{}');
		return {
			sessions: Array.isArray(p.sessions) ? p.sessions.slice(0, WINDOW) : [],
			recordedSession: typeof p.recordedSession === 'string' ? p.recordedSession : null,
		};
	} catch {
		return { sessions: [], recordedSession: null };
	}
}

function write(s: TendencyState) {
	if (import.meta.server) return;
	try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode / quota */ }
}

export function useHomeTendency() {
	// A per-tab session id (crypto.randomUUID avoids Math.random, which is
	// unavailable in some sandboxes; SSR is guarded above so 'ssr' never persists).
	const sessionId = useState<string>('home-tendency-session', () =>
		(import.meta.client && 'randomUUID' in crypto) ? crypto.randomUUID() : 'ssr',
	);

	/** Set this session's single outcome. `upgradeOnly` refuses to overwrite an
	 *  existing entry for the session (used by the provisional noteVisit). */
	function setOutcome(value: boolean, upgradeOnly = false) {
		const s = read();
		if (s.recordedSession === sessionId.value) {
			if (upgradeOnly) return; // already logged this visit; don't clobber
			s.sessions[0] = value;
		} else {
			s.sessions = [value, ...s.sessions].slice(0, WINDOW);
			s.recordedSession = sessionId.value;
		}
		write(s);
	}

	/** True when the user engaged the command center on ≥THRESHOLD of their last
	 *  WINDOW visits — i.e. they consistently want density. Read the *prior*
	 *  window, so the current visit's provisional entry doesn't skew the call. */
	function prefersDensity(): boolean {
		const s = read();
		const prior = s.recordedSession === sessionId.value ? s.sessions.slice(1) : s.sessions;
		return prior.filter(Boolean).length >= THRESHOLD;
	}

	const noteVisit = () => setOutcome(false, /* upgradeOnly */ true);
	const recordReveal = () => setOutcome(true);
	const startCalm = () => setOutcome(false);

	return { prefersDensity, noteVisit, recordReveal, startCalm };
}
