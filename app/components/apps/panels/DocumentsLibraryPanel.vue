<!--
  DocumentsLibraryPanel — slide-over body for the org Documents Library
  (reusable blocks + service offerings the proposal/contract builder
  draws from).

  Unlike the entity panels (Contact, Client, Proposal…), this is a
  singleton settings surface: the `id` prop is repurposed as the
  initial-tab key (`blocks` | `offerings`) so deep links can land on a
  specific tab without inventing a second URL slot.

  Wraps `<OrganizationDocumentsLibraryBody>` — same split pattern used
  by ClientWorkspace v2.1.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';
import type { DocumentsLibraryTab } from '~/components/Organization/DocumentsLibraryBody.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const VALID: DocumentsLibraryTab[] = ['blocks', 'offerings'];
const initialTab = computed<DocumentsLibraryTab>(() =>
	VALID.includes(props.id as DocumentsLibraryTab) ? (props.id as DocumentsLibraryTab) : 'blocks',
);
</script>

<template>
	<AppSlideOverShell title="Documents Library" subtitle="Reusable blocks + service offerings" @close="$emit('close')">
		<OrganizationDocumentsLibraryBody :initial-tab="initialTab" compact />
	</AppSlideOverShell>
</template>
