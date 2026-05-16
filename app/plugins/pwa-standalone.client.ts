/**
 * iOS PWA standalone-mode link trap.
 *
 * When Earnest is installed to the iPhone home screen, iOS Safari (pre-16.4)
 * opens any plain `<a href>` tap in mobile Safari — kicking the user out of
 * the installed app. NuxtLink/router navigation stays in-app, but any
 * non-router anchor (e.g. raw `<a>` inside HTML content, third-party
 * embeds, manually-built links) escapes the shell.
 *
 * This plugin intercepts same-origin anchor taps when running in standalone
 * mode and re-issues the navigation through `window.location.assign`, which
 * iOS honors as in-app. External hrefs and `target="_blank"` are left alone.
 *
 * Also tags `<html>` with `data-standalone` so CSS can opt into PWA-only
 * tweaks (e.g. extra top safe-area pad, hidden install prompts).
 */
export default defineNuxtPlugin(() => {
	if (typeof window === 'undefined') return;

	const isStandalone =
		window.matchMedia?.('(display-mode: standalone)').matches ||
		// Legacy iOS Safari exposes navigator.standalone instead.
		(window.navigator as Navigator & { standalone?: boolean }).standalone === true;

	if (!isStandalone) return;

	document.documentElement.dataset.standalone = 'true';

	function shouldTrap(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
		if (event.defaultPrevented) return false;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
		if (event.button !== 0) return false;
		const target = anchor.getAttribute('target');
		if (target && target !== '_self') return false;
		if (anchor.hasAttribute('download')) return false;
		const href = anchor.getAttribute('href');
		if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('sms:')) {
			return false;
		}
		try {
			const url = new URL(anchor.href, window.location.href);
			if (url.origin !== window.location.origin) return false;
		} catch {
			return false;
		}
		return true;
	}

	document.addEventListener(
		'click',
		(event) => {
			const path = event.composedPath();
			const anchor = path.find(
				(node): node is HTMLAnchorElement =>
					node instanceof HTMLAnchorElement && node.hasAttribute('href'),
			);
			if (!anchor) return;
			if (!shouldTrap(anchor, event)) return;
			event.preventDefault();
			window.location.assign(anchor.href);
		},
		{ capture: true },
	);
});
