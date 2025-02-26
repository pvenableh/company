<script setup>
const { readItem } = useDirectusItems();
const { user } = useDirectusAuth();
const { selectedOrg, hasMultipleOrgs, organizationOptions, setOrganization, clearOrganization, getOrganizationFilter } =
	useOrganization();
const { fetchTeams } = useTeams();
const config = useRuntimeConfig();

const org = ref(null); // Initialize org as a ref with null value

definePageMeta({
	middleware: ['auth'],
});

onMounted(async () => {
	// Use onMounted lifecycle hook
	if (selectedOrg.value) {
		try {
			org.value = await readItem('organizations', selectedOrg.value, {
				fields: [
					'*,teams.name,teams.id,teams.organization,teams.users.directus_users_id.*,teams.description,users.directus_users_id.id,users.directus_users_id.first_name,users.directus_users_id.last_name,users.directus_users_id.avatar,users.directus_users_id.email',
				],
			});
		} catch (error) {
			console.error('Error fetching organization:', error);
			// Handle error, e.g., display a message to the user
			org.value = null; // Reset org value in case of error
		}
	}
});

// Watch for changes in selectedOrg and fetch data if it changes. Useful for reactivity.
watch(selectedOrg, async (newVal) => {
	if (newVal) {
		try {
			org.value = await readItem('organizations', newVal, {
				fields: [
					'*,teams.name,teams.id,teams.organization,teams.users.directus_users_id.*,teams.description,users.directus_users_id.id,users.directus_users_id.first_name,users.directus_users_id.last_name,users.directus_users_id.avatar,users.directus_users_id.email',
				],
			});
		} catch (error) {
			console.error('Error fetching organization:', error);
			org.value = null;
		}
	} else {
		org.value = null; // Clear org if selectedOrg is null
	}
});

const handleTeamUpdate = async () => {
	// Refresh your teams list or whatever data needs updating
	await fetchTeams(selectedOrg.value);
};

const admin = computed(() => {
	if (user.value.role === config.public.adminRole) {
		return true;
	} else {
		return false;
	}
});
</script>

<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<h1 class="page__title">Company</h1>

		<div v-if="org" class="w-full flex flex-col items-center justify-center z-10 page__inner">
			<div v-for="(team, index) in org.teams" :key="index">
				<TeamsTeamCard :team="team" :canManageTeam="admin" @updated="handleTeamUpdate" />
			</div>
		</div>
		<div v-else-if="!org && selectedOrg">Loading organization data...</div>
		<div v-if="!selectedOrg">Please select an organization.</div>
	</div>
</template>
<style></style>
