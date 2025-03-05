<!-- components/TeamSelect.vue -->
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
						<UIcon name="i-heroicons-user-group" class="w-4 h-4 text-gray-400" />
						<span class="truncate text-[10px]">{{ currentTeamName }}</span>
					</div>
				</template>

				<!-- Option Template -->
				<template #option="{ option }">
					<div class="flex flex-col py-1">
						<div class="flex items-center">
							<span class="text-[10px] leading-3 font-medium">{{ option.name }}</span>
							<div class="ml-auto flex gap-1">
								<span v-if="option.isAll" class="text-[7px] bg-blue-100 text-blue-800 px-1 rounded">All</span>
								<span v-if="option.isManager" class="text-[7px] bg-green-100 text-green-800 px-1 rounded">Manager</span>
							</div>
						</div>
						<span v-if="option.description" class="text-[8px] leading-3 text-gray-500">
							{{ option.description }}
						</span>
					</div>
				</template>
			</USelectMenu>
			<USelectMenu
				v-else-if="singleRealTeam && userHasAdminAccess"
				v-model="localSelectedTeam"
				:options="singleTeamWithAllOption"
				option-attribute="name"
				value-attribute="id"
				:placeholder="currentTeamName"
				class="uppercase text-gray-400 ml-2 !pb-0"
				@change="handleSelectChange"
			>
				<!-- Label Template -->
				<template #label>
					<div class="flex items-center gap-2">
						<UIcon name="i-heroicons-user-group" class="w-4 h-4 text-gray-400" />
						<span class="truncate text-[10px]">{{ currentTeamName }}</span>
					</div>
				</template>

				<!-- Option Template -->
				<template #option="{ option }">
					<div class="flex flex-col py-1">
						<div class="flex items-center">
							<span class="text-[10px] leading-3 font-medium">{{ option.name }}</span>
							<div class="ml-auto flex gap-1">
								<span v-if="option.isAll" class="text-[7px] bg-blue-100 text-blue-800 px-1 rounded">All</span>
								<span v-if="option.isManager" class="text-[7px] bg-green-100 text-green-800 px-1 rounded">Manager</span>
							</div>
						</div>
						<span v-if="option.description" class="text-[8px] leading-3 text-gray-500">
							{{ option.description }}
						</span>
					</div>
				</template>
			</USelectMenu>
			<div v-else-if="singleRealTeam" class="ml-2 flex items-center space-x-2 text-[12px] leading-3 uppercase">
				<UIcon name="i-heroicons-user-group" class="w-4 h-4 text-gray-400" />
				<span>{{ singleRealTeam.name }}</span>
				<UBadge v-if="isTeamManager(singleRealTeam.id)" color="green" size="xs" class="text-[7px]">Manager</UBadge>
			</div>
			<div v-else class="ml-2 flex items-center space-x-2 text-[12px] leading-3 uppercase">
				<UIcon name="i-heroicons-user-group" class="w-4 h-4 text-gray-400" />
				<span>{{ userHasAdminAccess && selectedTeam === null ? 'All Teams' : 'No teams available' }}</span>
			</div>
		</template>
		<div v-else class="ml-2 flex items-center space-x-2 text-[12px] leading-3 uppercase text-gray-400">
			<UIcon name="i-heroicons-building-office" class="w-4 h-4" />
			<span>Select organization first</span>
		</div>
	</div>
</template>

<script setup>
const { teams, visibleTeams, selectedTeam, setTeam, fetchTeams, isTeamManager, canManageTeam, hasAdminAccess } =
	useTeams();
const { selectedOrg, currentOrg } = useOrganization();
const { user } = useDirectusAuth();

// Memoize the admin access check
const userHasAdminAccess = computed(() => {
	console.log(user.value);
	return hasAdminAccess(user.value);
});

// Create a local ref for v-model binding
const localSelectedTeam = ref(selectedTeam.value);

// Computed for team options with handling both admin and regular user views
const teamOptions = computed(() => {
	if (!selectedOrg.value) return [];

	// For admin/client managers, include "All Teams" option first
	const allTeamsOption = userHasAdminAccess.value
		? [
				{
					id: null,
					name: 'All Teams',
					description: 'View items from all teams',
					isAll: true,
				},
			]
		: [];

	// Then include all visible teams the user can access
	const teamsList = visibleTeams.value.map((team) => ({
		id: team.id,
		name: team.name,
		description: team.description || 'No description',
		isManager: isTeamManager(team.id),
	}));

	return [...allTeamsOption, ...teamsList];
});

// Options for when there's only one team but user is admin
const singleTeamWithAllOption = computed(() => {
	if (!singleRealTeam.value) return [];

	return [
		{
			id: null,
			name: 'All Teams',
			description: 'View items from all teams',
			isAll: true,
		},
		{
			id: singleRealTeam.value.id,
			name: singleRealTeam.value.name,
			description: singleRealTeam.value.description || 'No description',
			isManager: isTeamManager(singleRealTeam.value.id),
		},
	];
});

// Check if the current organization has any teams
const hasTeams = computed(() => {
	return visibleTeams.value && visibleTeams.value.length > 0;
});

// If there's only one team, use it for display
const singleRealTeam = computed(() => {
	return visibleTeams.value && visibleTeams.value.length === 1 ? visibleTeams.value[0] : null;
});

// Computed to check if there are multiple teams
const hasMultipleTeams = computed(() => {
	return selectedOrg.value && visibleTeams.value.length > 1;
});

// Watch for external changes to selectedTeam
watch(
	() => selectedTeam.value,
	(newVal) => {
		localSelectedTeam.value = newVal;
	},
);

// Watch for organization changes to fetch teams
watch(
	() => selectedOrg.value,
	async (newOrgId) => {
		if (newOrgId) {
			// console.log(`Organization changed to ${newOrgId}, fetching teams...`);
			await fetchTeams(newOrgId);
		} else {
			// Clear team selection when no org is selected
			localSelectedTeam.value = null;
			setTeam(null);
		}
	},
	{ immediate: true },
);

const handleSelectChange = (value) => {
	// console.log('Selected team ID:', value);
	setTeam(value);
};

// Computed property to get the current team name
const currentTeamName = computed(() => {
	if (!selectedOrg.value) return 'Select Organization First';

	// Handle the "All Teams" option (null value)
	if (selectedTeam.value === null && userHasAdminAccess.value) return 'All Teams';

	// For regular teams
	const team = visibleTeams.value.find((t) => t.id === selectedTeam.value);
	return team?.name || 'Select Team';
});

onMounted(() => {
	console.log('TeamSelect mounted. selectedOrg:', selectedOrg.value);
	if (selectedOrg.value) {
		console.log('Initial teams fetch on mount for org:', selectedOrg.value);
		fetchTeams(selectedOrg.value);
	}
	setTimeout(() => {
		console.log('visible teams: ', visibleTeams.value);
		console.log('selected team: ', selectedTeam.value);
		console.log('has multiple teams: ', hasMultipleTeams.value);
		console.log('single real team: ', singleRealTeam.value);
		console.log('user has admin access: ', userHasAdminAccess.value);
		console.log('team options: ', teamOptions.value);
	}, 2000);
});

const props = defineProps({
	containerClass: {
		type: String,
		default: 'w-full lg:w-64 relative',
	},
});
</script>
