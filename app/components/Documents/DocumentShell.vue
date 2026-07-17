<script setup lang="ts">
import { resolveDocumentTheme, resolveThemeConfigVars } from '~/composables/useDocumentTheme';
import type { DocumentThemeSource, DocumentThemeConfig } from '~/composables/useDocumentTheme';

/**
 * DocumentShell — wraps the body of any client-facing document (invoice,
 * proposal, contract) so it picks up the org's selected theme. Reads
 * `document_theme` + `document_accent` (+ `document_theme_config`) off the
 * seller (org) record. Override props drive the live theme-studio preview.
 */

const props = defineProps<{
	seller?: DocumentThemeSource | null;
	/** Override theme regardless of seller — useful for live preview. */
	themeOverride?: string | null;
	accentOverride?: string | null;
	/** Override the customization layer regardless of seller — live preview. */
	configOverride?: DocumentThemeConfig | Record<string, any> | null;
	/** Extra classes appended to the shell wrapper. */
	wrapperClass?: string;
}>();

const theme = computed(() => {
	if (props.themeOverride) return resolveDocumentTheme({ document_theme: props.themeOverride });
	return resolveDocumentTheme(props.seller || null);
});
const accent = computed(() => props.accentOverride || props.seller?.document_accent || null);
const config = computed(() => props.configOverride ?? props.seller?.document_theme_config ?? null);

const shellClass = computed(() => ['doc-shell', `doc-theme--${theme.value}`]);
const shellStyle = computed<Record<string, string>>(() => {
	const out: Record<string, string> = { ...resolveThemeConfigVars(config.value) };
	if (accent.value) out['--doc-accent-color'] = String(accent.value);
	return out;
});
</script>

<template>
	<div :class="[...shellClass, wrapperClass]" :style="shellStyle">
		<slot />
	</div>
</template>
