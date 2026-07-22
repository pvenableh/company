<!--
	TeamsPanel — slide-over wrapper around `OrganizationTeamsBody`.

	Lives at depth 1 in the universal slide-over stack. Opened with `_` it
	shows the full teams grid ("Manage teams" / create). Opened scoped to a
	real team id (slide=teams:<id>, e.g. clicking a team card) it forwards
	that id so the body opens straight into that team's editor.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const focusTeamId = computed(() => (props.id && props.id !== '_' ? props.id : null));
</script>

<template>
	<AppSlideOverShell
		:title="focusTeamId ? 'Edit team' : 'Teams'"
		:subtitle="focusTeamId ? 'Update this team’s details and members' : 'Group members for permissions and assignment'"
		@close="$emit('close')"
	>
		<OrganizationTeamsBody compact :focus-team-id="focusTeamId" />
	</AppSlideOverShell>
</template>
