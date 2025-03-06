<template>
	<div v-if="selectedOrg" :class="containerClass" class="team-selector" ref="dropdownRef">
		<button
			@click="toggleDropdown"
			class="flex items-center group relative focus:outline-none rounded-full border-2 border-[var(--cyan)]"
		>
			<div v-if="selectedTeam && currentTeam">
				<div
					v-if="currentTeam.icon"
					class="h-8 w-8 rounded-full bg-white flex items-center justify-center relative shadow"
				>
					<img
						:src="`${$config.public.directusUrl}/assets/${currentTeam.icon}?key=avatar`"
						alt="Team Icon"
						class="h-full w-full object-cover rounded-full"
					/>
				</div>
				<div v-else class="h-8 w-8 rounded-full bg-white flex items-center justify-center relative shadow">
					<span class="font-medium text-gray-700 text-sm">
						{{ getTeamInitials(currentTeam) }}
					</span>
				</div>
			</div>
			<div v-else class="h-8 w-8 rounded-full bg-white flex items-center justify-center relative shadow">
				<UIcon name="i-heroicons-user-group" class="w-5 h-5 text-gray-400" />
			</div>
			<!-- <span class="sr-only">Select Team</span> -->
		</button>

		<Transition
			enter-active-class="transition duration-200 ease-out"
			enter-from-class="opacity-0 scale-95 translate-y-1"
			enter-to-class="opacity-100 scale-100 translate-y-0"
			leave-active-class="transition duration-150 ease-in"
			leave-from-class="opacity-100 scale-100 translate-y-0"
			leave-to-class="opacity-0 scale-95 translate-y-1"
		>
			<div
				v-if="isDropdownOpen"
				class="absolute z-50 top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 overflow-hidden"
			>
				<div class="py-1 px-2 text-xs uppercase font-medium text-gray-600 dark:text-gray-400">Teams</div>
				<div class="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
				<div class="max-h-60 overflow-y-auto">
					<button
						v-for="option in teamOptions"
						:key="option.id"
						@click="handleTeamSelect(option.id)"
						class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
						:class="{ 'bg-blue-50 dark:bg-blue-900': selectedTeam && option.id === selectedTeam }"
					>
						<UIcon v-if="option.isAll" name="i-heroicons-user-group" class="w-4 h-4 flex-shrink-0" />
						<div v-else-if="getTeamIcon(option)" class="h-4 w-4 rounded-full flex-shrink-0">
							<img
								:src="getTeamIcon(option)"
								:alt="`${option.name} Icon`"
								class="h-full w-full object-cover rounded-full"
							/>
						</div>
						<div v-else class="h-4 w-4 rounded-full bg-white flex items-center justify-center flex-shrink-0">
							<span class="font-medium text-gray-700 text-[10px]">{{ getTeamInitials(option) }}</span>
						</div>
						<span class="text-[11px] uppercase leading-3 truncate">
							{{ option.name }}
						</span>
						<div class="ml-auto flex gap-1">
							<span v-if="option.isAll" class="text-[7px] bg-blue-100 text-blue-800 px-1 rounded">All</span>
							<span v-if="option.isManager" class="text-[7px] bg-green-100 text-green-800 px-1 rounded">Manager</span>
						</div>
					</button>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { onClickOutside } from '@vueuse/core';

const { teams, visibleTeams, selectedTeam, setTeam, fetchTeams, isTeamManager, canManageTeam, hasAdminAccess } =
	useTeams();
const { selectedOrg } = useOrganization();
const { user } = useDirectusAuth();
const $config = useRuntimeConfig();

const isDropdownOpen = ref(false);
const dropdownRef = ref(null);

const userHasAdminAccess = computed(() => {
	return hasAdminAccess(user.value);
});

// Add getTeamIcon computed property
const getTeamIcon = (team) => {
	if (!team || !team.id) return '';

	const teamData = teams.value.find((t) => t.id === team.id);

	if (teamData && teamData.icon) {
		return `${$config.public.directusUrl}/assets/${teamData.icon}?key=avatar`;
	}
	return null;
};
// Add getTeamInitials method
const getTeamInitials = (team) => {
	if (!team || !team.name) return '';
	return team.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2); // Up to 2 initials
};

const teamOptions = computed(() => {
	if (!selectedOrg.value) return [];
	const allTeamsOption = userHasAdminAccess.value
		? [{ id: null, name: 'All Teams', description: 'View items from all teams', isAll: true }]
		: [];
	const teamsList = visibleTeams.value.map((team) => ({
		id: team.id,
		name: team.name,
		description: team.description || 'No description',
		isManager: isTeamManager(team.id),
		icon: team.icon, // Add the icon to the option
	}));
	return [...allTeamsOption, ...teamsList];
});

watch(
	() => selectedOrg.value,
	async (newOrgId) => {
		if (newOrgId) {
			await fetchTeams(newOrgId);
		} else {
			setTeam(null);
		}
	},
	{ immediate: true },
);

const handleTeamSelect = (teamId) => {
	setTeam(teamId);
	isDropdownOpen.value = false;
};

const currentTeam = computed(() => {
	if (!selectedTeam.value) return null;
	return teams.value.find((team) => team.id === selectedTeam.value);
});

// Computed property to get the current team name for the tooltip
const currentTeamName = computed(() => {
	if (!selectedOrg.value) return 'Select Organization First';
	if (selectedTeam.value === null && userHasAdminAccess.value) return 'All Teams';
	const team = visibleTeams.value.find((t) => t.id === selectedTeam.value);
	return team?.name || 'Select Team';
});

const toggleDropdown = () => {
	isDropdownOpen.value = !isDropdownOpen.value;
};

onClickOutside(dropdownRef, () => {
	isDropdownOpen.value = false;
});

onMounted(() => {
	if (selectedOrg.value) {
		fetchTeams(selectedOrg.value);
	}
});

const props = defineProps({
	containerClass: {
		type: String,
		default: 'relative flex items-center justify-center',
	},
});
</script>

<style scoped>
.team-selector {
	position: relative; /* Important for absolute positioning of the dropdown */
}
</style>
