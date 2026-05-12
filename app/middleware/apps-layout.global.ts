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
 * alone, as are paths that have nothing to do with the authenticated
 * product surface (auth flows, portal, register).
 *
 * Runs client-side only — `useAppsMode` hydrates from a client-only fetch.
 */
export default defineNuxtRouteMiddleware((to) => {
	if (import.meta.server) return;

	// Pages with explicit non-default layouts — never override.
	const ownLayouts = ['auth', 'apps', 'client-portal', 'email', 'blank'];
	const explicitLayout = to.meta.layout;
	if (typeof explicitLayout === 'string' && ownLayouts.includes(explicitLayout)) {
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
