<!--
	OrganizationTeamsBody — shared inner body for the Teams admin surface.

	The actual Teams editor (cards, create/edit/delete modals, member
	manager) already lives in `TeamsManageTeams` and is re-used by the
	classic `/organization?tab=teams` view. This component just hosts it
	with the org-scoped fetch so the apps-layout slide-over can render
	the exact same UI without duplicating wiring.
-->
<template>
	<div>
		<UAlert
			v-if="!selectedOrg"
			class="mb-6"
			title="No organization selected"
			description="Pick an organization from the global header to manage teams."
			color="blue"
		/>

		<div v-else-if="loading" class="flex justify-center py-12">
			<UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
		</div>

		<TeamsManageTeams
			v-else
			:embedded="true"
			:organization-id="selectedOrg"
			:initial-teams="visibleTeams"
			:external-loading="loading"
			:focus-team-id="focusTeamId"
		/>
	</div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
	compact?: boolean;
	// Forwarded from the slide-over: when set to a real team id, ManageTeams
	// opens that team's editor directly (see TeamsManageTeams).
	focusTeamId?: string | null;
}>(), {
	compact: false,
	focusTeamId: null,
});

const { selectedOrg } = useOrganization();
const { visibleTeams, loading, fetchTeams, setupStorageListener } = useTeams();

// Mirrors `/organization/index.vue`: cross-tab sync so a team created
// in another browser tab reflects here too.
const cleanup = setupStorageListener?.();
onUnmounted(() => {
	if (typeof cleanup === 'function') cleanup();
});

watch(
	() => selectedOrg.value,
	(orgId) => {
		if (orgId) fetchTeams(orgId).catch(() => {});
	},
	{ immediate: true },
);
</script>
