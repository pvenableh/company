<!--
	RolesPanel — slide-over wrapper around `OrganizationRolesBody`.

	Lives at depth 1 in the universal slide-over stack. The `id` prop
	from the URL is unused (the surface has no sub-tabs); pages should
	open with the placeholder `_`.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();
</script>

<template>
	<AppSlideOverShell
		title="Roles & Permissions"
		subtitle="Custom roles and feature access matrix"
		@close="$emit('close')"
	>
		<OrganizationRolesBody compact />
	</AppSlideOverShell>
</template>
