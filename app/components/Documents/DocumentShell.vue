<script setup lang="ts">
import { resolveDocumentTheme } from '~/composables/useDocumentTheme';
import type { DocumentThemeSource } from '~/composables/useDocumentTheme';

/**
 * DocumentShell — wraps the body of any client-facing document (invoice,
 * proposal, contract) so it picks up the org's selected theme. Reads
 * `document_theme` + `document_accent` off the seller (org) record.
 */

const props = defineProps<{
	seller?: DocumentThemeSource | null;
	/** Override theme regardless of seller — useful for live preview. */
	themeOverride?: string | null;
	accentOverride?: string | null;
	/** Extra classes appended to the shell wrapper. */
	wrapperClass?: string;
}>();

const theme = computed(() => {
	if (props.themeOverride) return resolveDocumentTheme({ document_theme: props.themeOverride });
	return resolveDocumentTheme(props.seller || null);
});
const accent = computed(() => props.accentOverride || props.seller?.document_accent || null);

const shellClass = computed(() => ['doc-shell', `doc-theme--${theme.value}`]);
const shellStyle = computed<Record<string, string>>(() => {
	const out: Record<string, string> = {};
	if (accent.value) out['--doc-accent-color'] = String(accent.value);
	return out;
});
</script>

<template>
	<div :class="[...shellClass, wrapperClass]" :style="shellStyle">
		<slot />
	</div>
</template>
