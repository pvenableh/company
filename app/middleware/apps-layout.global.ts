/**
 * Apps Layout middleware — every in-app page renders inside the apps shell.
 *
 * The classic layout has been removed, so EVERY in-app page should render
 * inside the apps shell — not just the `/apps/*` routes. This middleware
 * rewrites `to.meta.layout` to `'apps'` for any page that would otherwise fall
 * back to the `default` layout, so navigating to /projects/[id], /account, etc.
 * stays in the apps chrome. (The `default` layout itself also delegates to apps
 * now, so this just skips the redundant wrapper.)
 *
 * Pages with their own explicit non-default layout (auth/client-portal/email/
 * blank) are left alone. Runs client-side only.
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
	// because it renders its own <NuxtLayout>. Don't force the apps shell on
	// top of that or both layouts stack and the chrome doubles up.
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

	setPageLayout('apps');
});
