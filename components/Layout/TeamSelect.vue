<!-- components/TeamSelect.vue -->
<script setup>
const { teams, allTeams, selectedTeam, setTeam, fetchTeams, DEFAULT_TEAM_ID, isDefaultTeam } = useTeams();
const { selectedOrg } = useOrganization();

// Create a local ref for v-model binding
const localSelectedTeam = ref(selectedTeam.value);

// Computed for team options with virtual default team handling
const teamOptions = computed(() => {
	if (!selectedOrg.value) return [];

	return allTeams.value.map((team) => ({
		id: team.id,
		name: team.isVirtual ? 'All Users' : team.name,
		description: team.isVirtual ? 'View all users in this organization' : team.description,
		isVirtual: team.isVirtual,
	}));
});

const hasTeams = computed(() => {
	return teams.value && teams.value.length > 0;
});

const singleRealTeam = computed(() => {
	return teams.value && teams.value.length === 1 ? teams.value[0] : null;
});

// Computed to check if there are multiple teams (including the default)
const hasMultipleTeams = computed(() => {
	// Either we have at least one real team, or we have the default team
	return (selectedOrg.value && hasTeams.value) || isDefaultTeam.value;
});

// Watch for external changes to selectedTeam
watch(selectedTeam, (newVal) => {
	localSelectedTeam.value = newVal;
});

// Watch for organization changes to fetch teams
watch(selectedOrg, async (newOrgId) => {
	if (newOrgId) {
		await fetchTeams(newOrgId);
		// Automatically select the default team when organization changes
		localSelectedTeam.value = DEFAULT_TEAM_ID;
		setTeam(DEFAULT_TEAM_ID);
	} else {
		// Clear team selection when no org is selected
		localSelectedTeam.value = DEFAULT_TEAM_ID;
		setTeam(DEFAULT_TEAM_ID);
	}
});

const handleSelectChange = (value) => {
	console.log('Selected team ID:', value);
	const teamId = value === 'null' ? DEFAULT_TEAM_ID : value;
	setTeam(teamId);
};

// Computed property to get the current team name
const currentTeamName = computed(() => {
	if (!selectedOrg.value) return 'Select Organization First';

	// Handle the virtual default team specially
	if (isDefaultTeam.value) return 'All Users';

	// For regular teams
	const selectedOption = teamOptions.value.find((team) => team.id === selectedTeam.value);
	return selectedOption?.name || 'Select Team';
});

onMounted(async () => {
	if (selectedOrg.value) {
		console.log('Initial fetch for org:', selectedOrg.value);
		await fetchTeams(selectedOrg.value);
	}
});

const props = defineProps({
	containerClass: {
		type: String,
		default: 'w-full lg:w-64 relative',
	},
});
</script>

<template>
	<div :class="containerClass">
		<template v-if="selectedOrg">
			<USelectMenu
				v-if="hasMultipleTeams"
				v-model="localSelectedTeam"
				:options="teamOptions"
				option-attribute="name"
				value-attribute="id"
				:placeholder="currentTeamName"
				class="uppercase text-gray-400 ml-2 !pb-0"
				@change="handleSelectChange"
				searchable
			>
				<!-- Label Template -->
				<template #label>
					<div class="flex items-center gap-2">
						<span class="truncate text-[10px]">{{ currentTeamName }}</span>
					</div>
				</template>

				<!-- Option Template -->
				<template #option="{ option }">
					<div class="flex flex-col py-1">
						<div class="flex items-center">
							<span class="text-[10px] leading-3 font-medium">{{ option.name }}</span>
							<span v-if="option.isVirtual" class="ml-1 text-[7px] bg-blue-100 text-blue-800 px-1 rounded">
								Default
							</span>
						</div>
						<span v-if="option.description" class="text-[8px] leading-3 text-gray-500">
							{{ option.description }}
						</span>
					</div>
				</template>
			</USelectMenu>
			<div v-else-if="singleRealTeam" class="ml-2 flex items-center space-x-2 text-[12px] leading-3 uppercase">
				{{ isDefaultTeam ? 'All Users' : singleRealTeam.name }}
			</div>
			<div v-else class="ml-2 flex items-center space-x-2 text-[12px] leading-3 uppercase">
				{{ isDefaultTeam ? 'All Users' : 'No teams available' }}
			</div>
		</template>
		<div v-else class="ml-2 flex items-center space-x-2 text-[12px] leading-3 uppercase text-gray-400">
			Select organization first
		</div>
	</div>
</template>
