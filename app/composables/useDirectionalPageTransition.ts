import { APP_ORDER, APP_FOOTER_ORDER, appIdForPath } from '~/composables/useAppAccent';

/**
 * useDirectionalPageTransition
 *
 * Drives a left-to-right (or right-to-left) slide between top-level apps so
 * page motion mirrors each app's position in the rail's filmstrip:
 *
 *   Dashboard → People → Work → Money → Marketing → Organization → Account
 *
 * Navigating to a LATER app slides the new page in from the right
 * (`app-slide-forward`); to an EARLIER app it slides in from the left
 * (`app-slide-back`). Intra-app navigation and anything we can't place in the
 * sequence falls back to the gentle `page-fade-up` so detail drill-downs and
 * non-app routes keep their existing feel.
 *
 * The returned `transition` object is bound to `<NuxtPage :transition>` in
 * app.vue. It carries `onLeave`/`onEnter` timeout fallbacks so a throttled,
 * hidden, or headless tab — where `transitionend` may never fire — can't stall
 * the `out-in` swap mid-flight.
 */

// Canonical left-to-right order: primary rail apps, then the footer apps.
const ORDER: string[] = [...APP_ORDER, ...APP_FOOTER_ORDER];

function appOrderIndex(path: string): number {
	const id = appIdForPath(path);
	if (!id) return -1;
	return ORDER.indexOf(id);
}

// rAF-starvation fallback (mirrors the nuxt.config pageTransition hooks):
// resolve the transition via `transitionend` when possible, but always settle
// by `max` ms so hidden/headless tabs never leave the swap half-finished.
function settle(max: number) {
	return (el: Element, done: () => void) => {
		let called = false;
		const finish = () => {
			if (called) return;
			called = true;
			el.removeEventListener('transitionend', onEnd);
			done();
		};
		function onEnd(e: Event) {
			if (e.target === el) finish();
		}
		el.addEventListener('transitionend', onEnd);
		setTimeout(finish, max);
	};
}

export function useDirectionalPageTransition() {
	const router = useRouter();
	// useState so SSR + client agree on the initial name (the default fade).
	const name = useState('directional-page-transition', () => 'page-fade-up');

	router.beforeEach((to, from) => {
		const toIdx = appOrderIndex(to.path);
		const fromIdx = appOrderIndex(from.path);

		if (toIdx === -1 || fromIdx === -1 || toIdx === fromIdx) {
			// Same app, or a route outside the app sequence → keep the fade.
			name.value = 'page-fade-up';
		} else if (toIdx > fromIdx) {
			name.value = 'app-slide-forward';
		} else {
			name.value = 'app-slide-back';
		}
	});

	const transition = computed(() => ({
		name: name.value,
		mode: 'out-in' as const,
		onLeave: settle(300),
		onEnter: settle(450),
	}));

	return { transition };
}
