/**
 * app-palette.client — apply the active palette's semantic tokens +
 * glass-chrome surface flag to `<html>` on every client navigation.
 *
 * `useAppPalette()` already calls `applyPaletteToDocument` during hydrate
 * and on explicit `setPalette` calls, but the user's stored value can
 * also surface through `useDirectusAuth().user` (when SSR pre-hydrated
 * the user). This plugin keeps the document in sync with whatever the
 * composable's `palette` + `glassChrome` currently resolve to — one
 * watcher, one source of truth.
 */
import { applyPaletteToDocument } from '~/composables/useAppAccent';
import { useAppPalette } from '~/composables/useAppPalette';

export default defineNuxtPlugin(() => {
	const { palette, glassChrome, paletteTint } = useAppPalette();
	watch(
		palette,
		(next) => {
			applyPaletteToDocument(next);
		},
		{ immediate: true },
	);
	watch(
		glassChrome,
		(on) => {
			document.documentElement.setAttribute('data-surface', on ? 'glass' : 'solid');
		},
		{ immediate: true },
	);
	watch(
		paletteTint,
		(on) => {
			document.documentElement.setAttribute('data-rail-tint', on ? 'on' : 'off');
		},
		{ immediate: true },
	);
});
