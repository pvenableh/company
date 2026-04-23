/**
 * Auto-start a walkthrough tour when `?tour=1` is present.
 *
 * /try-demo redirects to `/?tour=1` after demo-login. The index page
 * isn't a tour target itself, so we persist the flag in sessionStorage
 * and the watcher below auto-starts whichever tour matches the route
 * as the visitor navigates (e.g. the contacts tour fires the first time
 * they open /contacts/[id]).
 *
 * We also strip `?tour=1` from the URL once consumed so reloads don't
 * re-trigger the tour loop.
 */
import { getToursForRoute } from '~/utils/walkthrough-tours';

const FLAG_KEY = 'earnest-demo-tour-pending';

export default defineNuxtPlugin(() => {
	const route = useRoute();
	const router = useRouter();
	const { startTour, isActive, isTourCompleted } = useWalkthrough();

	function setFlag() {
		try {
			sessionStorage.setItem(FLAG_KEY, '1');
		} catch {}
	}
	function clearFlag() {
		try {
			sessionStorage.removeItem(FLAG_KEY);
		} catch {}
	}
	function flagSet(): boolean {
		try {
			return sessionStorage.getItem(FLAG_KEY) === '1';
		} catch {
			return false;
		}
	}

	function maybeStart(path: string) {
		if (!flagSet()) return;
		if (isActive.value) return;
		const tours = getToursForRoute(path);
		const next = tours.find((t) => !isTourCompleted(t.id));
		if (!next) return;
		// Defer until the target DOM has rendered.
		setTimeout(() => {
			startTour(next.id);
			clearFlag();
		}, 500);
	}

	function stripTourQuery() {
		if (route.query.tour == null) return;
		const { tour: _drop, ...rest } = route.query;
		router.replace({ path: route.path, query: rest, hash: route.hash });
	}

	// Initial handling: if the URL has ?tour=1, set the flag and strip it.
	if (route.query.tour === '1') {
		setFlag();
		stripTourQuery();
	}

	// On every navigation, try to start a tour if the flag is set and a
	// matching tour exists for the new route.
	watch(
		() => route.path,
		(newPath) => {
			maybeStart(newPath);
		},
		{ immediate: true },
	);
});
