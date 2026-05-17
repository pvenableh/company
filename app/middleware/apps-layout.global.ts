/**
 * Apps Layout middleware — keeps users in their chosen shell.
 *
 * When a user has opted into Apps Layout (`users.layout_mode = 'apps'`),
 * EVERY in-app page should render inside the apps shell — not just the
 * `/apps/*` routes. Otherwise clicking through to /projects/[id],
 * /meetings/[id], /account, etc. teleports them out of the apps chrome
 * and back into the classic sidebar, which feels like a layout regression.
 *
 * This middleware rewrites `to.meta.layout` to `'apps'` for any page that
 * would otherwise fall back to the `default` layout. Pages with their own
 * explicit non-default layout (auth/client-portal/email/blank) are left
 * alone — `client-portal` is itself a reactive wrapper that picks
 * apps-vs-classic from `useAppsMode().mode` at render time.
 *
 * Runs client-side only — `useAppsMode` hydrates from a client-only fetch.
 */
export default defineNuxtRouteMiddleware((to) => {
	if (import.meta.server) return;

	const explicitLayout = to.meta.layout;

	// Pages with explicit non-default layouts — never override.
	const ownLayouts = ['auth', 'apps', 'client-portal', 'email', 'blank'];
	if (typeof explicitLayout === 'string' && ownLayouts.includes(explicitLayout)) {
		return;
	}
	// `layout: false` is the page opting out of automatic layout — usually
	// because it renders its own <NuxtLayout> with a computed name. Don't
	// force the apps shell on top of that or both layouts stack and the
	// chrome doubles up.
	if (explicitLayout === false) {
		return;
	}

	// Path-level skips for routes that should never be wrapped in apps shell.
	if (
		to.path.startsWith('/auth')
		|| to.path.startsWith('/portal')
		|| to.path === '/try-demo'
		|| to.path === '/register'
	) {
		return;
	}

	const { isAppsMode } = useAppsMode();
	if (isAppsMode.value) {
		setPageLayout('apps');
	}
});
