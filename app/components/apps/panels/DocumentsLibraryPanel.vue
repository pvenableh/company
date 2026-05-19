<!--
	DocumentsLibraryPanel — slide-over wrapper around `OrganizationDocumentsLibraryBody`.

	Used at depth 1 in the universal slide-over stack. The panel's `id`
	from the URL (`?slide=documents_library:<tab>`) maps to the initial
	tab of the embedded body — `blocks` or `offerings`. Anything else
	(including the placeholder `_`) falls back to `blocks`.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

type TabKey = 'blocks' | 'offerings';
const VALID_TABS: TabKey[] = ['blocks', 'offerings'];

const initialTab = computed<TabKey>(() =>
	VALID_TABS.includes(props.id as TabKey) ? (props.id as TabKey) : 'blocks',
);

// Keep the slide-over URL's id segment in sync with the active tab so
// reload / bookmark restores the same view.
const { push } = useAppSlideOverStack();
function onTabChange(tab: TabKey) {
	push('documents_library', tab);
}
</script>

<template>
	<AppSlideOverShell
		title="Documents Library"
		subtitle="Reusable blocks + service offerings"
		@close="$emit('close')"
	>
		<OrganizationDocumentsLibraryBody
			:initial-tab="initialTab"
			compact
			@update:tab="onTabChange"
		/>
	</AppSlideOverShell>
</template>
