<!--
  TouchpointPanel — slide-over body for logging a touchpoint (create-only).

  Hosts the extracted <AppsTouchpointLogForm> inside the stack shell so the
  "Log touchpoint" action reads as part of the same stacked slide-over family
  as every other create. Scope (org/client/project/contact/lead) arrives via
  `createContext`; on save it notifies every mounted touchpoint list + pops.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string; mode?: string }>();
defineEmits<{ (e: 'close'): void }>();

const { createContext, emitCreated } = useCreatePanel<{
	organizationId?: string | null;
	clientId?: string | null;
	projectId?: string | null;
	contactId?: string | null;
	leadId?: string | number | null;
}, any>('touchpoint');

function onSaved(row: any) {
	emitCreated(row);
}
</script>

<template>
	<AppSlideOverShell title="Log Touchpoint" @close="$emit('close')">
		<AppsTouchpointLogForm
			embedded
			:organization-id="createContext?.organizationId ?? null"
			:client-id="createContext?.clientId ?? null"
			:project-id="createContext?.projectId ?? null"
			:contact-id="createContext?.contactId ?? null"
			:lead-id="createContext?.leadId ?? null"
			@saved="onSaved"
		/>
	</AppSlideOverShell>
</template>
