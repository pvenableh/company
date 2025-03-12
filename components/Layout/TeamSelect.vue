<template>
	<div :class="containerClass" class="team-selector" ref="dropdownRef">
		<!-- When organization is selected -->
		<div v-if="selectedOrg">
			<!-- For Regular User with Only One Team - Static Display (No Dropdown) -->
			<div
				v-if="isRegularUserWithSingleTeam"
				class="flex items-center gap-2 rounded-full border-2 border-[var(--cyan)] p-1"
			>
				<!-- Team Avatar -->
				<div class="h-7 w-7 rounded-full bg-white flex items-center justify-center relative shadow">
					<div v-if="singleTeam">
						<div v-if="singleTeam.icon">
							<img
								:src="`${$config.public.directusUrl}/assets/${singleTeam.icon}?key=avatar`"
								alt="Team Icon"
								class="object-cover rounded-full"
							/>
						</div>
						<div v-else class="h-full w-full flex items-center justify-center">
							<span class="font-medium text-gray-700 text-sm">{{ getTeamInitials(singleTeam) }}</span>
						</div>
					</div>
					<UIcon v-else name="i-heroicons-user-group" class="w-5 h-5 text-gray-400" />
				</div>

				<!-- Team Name (visible on larger screens) -->
				<span class="hidden md:block text-xs uppercase truncate max-w-24 pr-1">
					{{ singleTeam?.name || 'Your Team' }}
				</span>
			</div>

			<!-- Dropdown Button - For Admin or Users with Multiple Teams -->
			<button
				v-else
				@click="toggleDropdown"
				class="flex items-center gap-2 group relative focus:outline-none rounded-full border-2 border-[var(--cyan)] p-1"
			>
				<!-- Team Avatar -->
				<div class="h-7 w-7 rounded-full bg-white flex items-center justify-center relative shadow">
					<div v-if="selectedTeam && currentTeam">
						<div v-if="currentTeam.icon">
							<img
								:src="`${$config.public.directusUrl}/assets/${currentTeam.icon}?key=avatar`"
								alt="Team Icon"
								class="object-cover rounded-full"
							/>
						</div>
						<div v-else class="h-full w-full flex items-center justify-center">
							<span class="font-medium text-gray-700 text-sm">{{ getTeamInitials(currentTeam) }}</span>
						</div>
					</div>
					<UIcon v-else name="i-heroicons-user-group" class="w-5 h-5 text-gray-400" />
				</div>

				<!-- Team Name (visible on larger screens) -->
				<span class="hidden md:block text-xs uppercase truncate max-w-24">
					{{ currentTeamName }}
				</span>

				<!-- Dropdown indicator -->
				<UIcon
					:name="isDropdownOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
					class="w-3 h-3 text-gray-400 hidden md:block"
				/>
			</button>

			<!-- Team Dropdown - Only for Admin or Users with Multiple Teams -->
			<Transition
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="opacity-0 scale-95 translate-y-1"
				enter-to-class="opacity-100 scale-100 translate-y-0"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="opacity-100 scale-100 translate-y-0"
				leave-to-class="opacity-0 scale-95 translate-y-1"
			>
				<div
					v-if="isDropdownOpen && !isRegularUserWithSingleTeam"
					class="absolute z-50 top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 overflow-hidden"
				>
					<div class="py-1 px-2 text-xs uppercase font-medium text-gray-600 dark:text-gray-400">Teams</div>
					<div class="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>

					<!-- Loading State -->
					<div v-if="loading" class="py-4 flex justify-center">
						<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-400" />
					</div>

					<!-- Empty Teams State -->
					<div v-else-if="!teamOptions.length" class="py-4 px-3 text-sm text-gray-500">
						<p class="text-[11px] uppercase leading-3">No teams available for this organization</p>
						<p v-if="debug" class="text-xs mt-1 text-red-500">
							Selected Org: {{ selectedOrg }}
							<br />
							Teams count: {{ visibleTeams.length }}
						</p>
					</div>

					<!-- Teams List -->
					<div v-else class="max-h-60 overflow-y-auto">
						<!-- Reset/Clear Selection Option - Only show for admins -->
						<button
							v-if="showClearTeamOption"
							@click="clearTeamSelection"
							class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left border-b border-gray-200 dark:border-gray-700"
						>
							<UIcon name="i-heroicons-x-circle" class="w-4 h-4 flex-shrink-0 text-gray-500" />
							<span class="text-[11px] uppercase leading-3 truncate text-gray-500">Deselect Team</span>
						</button>

						<!-- Team Options -->
						<button
							v-for="option in teamOptions"
							:key="option.id || 'all-teams'"
							@click="handleTeamSelect(option.id)"
							class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
							:class="{ 'bg-blue-50 dark:bg-blue-900': selectedTeam === option.id }"
						>
							<!-- Team Icon/Avatar -->
							<UIcon v-if="option.isAll" name="i-heroicons-user-group" class="w-4 h-4 flex-shrink-0" />
							<div v-else-if="getTeamIcon(option)" class="h-4 w-4 rounded-full flex-shrink-0">
								<img
									:src="getTeamIcon(option)"
									:alt="`${option.name} Icon`"
									class="h-full w-full object-cover rounded-full"
								/>
							</div>
							<div v-else class="h-4 w-4 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
								<span class="font-medium text-gray-700 text-[10px]">{{ getTeamInitials(option) }}</span>
							</div>

							<!-- Team Name -->
							<span class="text-[11px] uppercase leading-3 truncate">
								{{ option.name }}
							</span>

							<!-- Tags -->
							<div class="ml-auto flex gap-1">
								<span v-if="option.isAll" class="text-[7px] bg-blue-100 text-blue-800 px-1 rounded">All</span>
								<span v-if="option.isManager" class="text-[7px] bg-green-100 text-green-800 px-1 rounded">Manager</span>
							</div>
						</button>
					</div>
				</div>
			</Transition>
		</div>

		<!-- When no organization is selected -->
		<div v-else class="flex items-center space-x-2 text-[12px] leading-3 uppercase text-gray-400">
			<UIcon name="i-heroicons-building-office" class="w-4 h-4" />
			<span>Select organization</span>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { onClickOutside } from '@vueuse/core';

const props = defineProps({
	containerClass: {
		type: String,
		default: 'relative',
	},
	debug: {
		type: Boolean,
		default: false,
	},
});

// Composables
const {
	teams,
	visibleTeams,
	selectedTeam,
	setTeam,
	clearTeam,
	fetchTeams,
	isTeamManager,
	canManageTeam,
	hasAdminAccess,
	loading,
	showAllTeamsOption, // New function from our enhanced useTeams
} = useTeams();
const { selectedOrg, currentOrg } = useOrganization();
const { user } = useDirectusAuth();
const $config = useRuntimeConfig();

// Local state
const isDropdownOpen = ref(false);
const dropdownRef = ref(null);
const initialLoadComplete = ref(false);

// Close dropdown when clicking outside
onClickOutside(dropdownRef, () => {
	isDropdownOpen.value = false;
});

// Check if user is a regular user (non-admin) with only one team
const isRegularUserWithSingleTeam = computed(() => {
	// First, check if the user is an admin
	if (hasAdminAccess(user.value)) return false;

	// Next, check if there's only one visible team
	return visibleTeams.value?.length === 1;
});

// Get the single team for regular users with one team
const singleTeam = computed(() => {
	if (isRegularUserWithSingleTeam.value && visibleTeams.value?.length === 1) {
		return visibleTeams.value[0];
	}
	return null;
});

// Helper: Create default "All Teams" option for admin users
const getAllTeamsOption = () => {
	// Use the new showAllTeamsOption function to determine if we should show the All Teams option
	if (!showAllTeamsOption()) return [];

	return [
		{
			id: null,
			name: 'All Teams',
			description: 'View items from all teams',
			isAll: true,
		},
	];
};

// Show clear team option only for admins
const showClearTeamOption = computed(() => {
	// Only show "Deselect Team" for admins and only when a team is selected
	return hasAdminAccess(user.value) && selectedTeam.value !== null;
});

// Computed for team options in dropdown with proper reactivity
const teamOptions = computed(() => {
	if (!selectedOrg.value) return [];

	// Create all teams option for admins
	const allTeamsOption = getAllTeamsOption();

	// Handle when visibleTeams is undefined or empty
	if (!visibleTeams.value || visibleTeams.value.length === 0) {
		return allTeamsOption;
	}

	// Map visible teams to options with additional properties
	const teamsList = visibleTeams.value.map((team) => ({
		id: team.id,
		name: team.name,
		description: team.description || 'No description',
		isManager: isTeamManager(team.id),
		icon: team.icon,
		isVirtual: team.isVirtual || false,
	}));

	return [...allTeamsOption, ...teamsList];
});

// Get current team object
const currentTeam = computed(() => {
	if (!selectedTeam.value) return null;
	return teams.value.find((team) => team.id === selectedTeam.value) || null;
});

// Get team name for display
const currentTeamName = computed(() => {
	if (!selectedOrg.value) return 'Select Organization First';

	// For "All Teams" option (null value)
	if (selectedTeam.value === null && showAllTeamsOption()) return 'All Teams';

	// For regular teams
	const team = visibleTeams.value.find((t) => t.id === selectedTeam.value);
	return team?.name || 'Select Team';
});

// Get team icon URL
const getTeamIcon = (team) => {
	if (!team || !team.id) return null;

	// Find full team data
	const teamData = teams.value.find((t) => t.id === team.id);

	if (teamData?.icon) {
		return `${$config.public.directusUrl}/assets/${teamData.icon}?key=avatar`;
	}
	return null;
};

// Get team initials from name
const getTeamInitials = (team) => {
	if (!team || !team.name) return '';

	return team.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2); // Up to 2 initials
};

// Toggle dropdown visibility
const toggleDropdown = () => {
	isDropdownOpen.value = !isDropdownOpen.value;
};

// Handle team selection
const handleTeamSelect = (teamId) => {
	// Only call setTeam if the selected team is different
	if (teamId !== selectedTeam.value) {
		setTeam(teamId);
	}
	isDropdownOpen.value = false;
};

// Clear/reset team selection
const clearTeamSelection = () => {
	// Only allow admins to clear team selection
	if (hasAdminAccess(user.value)) {
		clearTeam();
		isDropdownOpen.value = false;
		console.log('TeamSelect: Team selection cleared');
	}
};

// Validate that a team belongs to the current organization
const isTeamValidForCurrentOrg = (teamId) => {
	if (!teamId || !selectedOrg.value) return false;
	return visibleTeams.value.some((team) => team.id === teamId);
};

// Watch for organization changes
watch(
	() => selectedOrg.value,
	async (newOrgId, oldOrgId) => {
		if (newOrgId && newOrgId !== oldOrgId) {
			console.log('TeamSelect: Organization changed, fetching teams for:', newOrgId);

			// Clear team selection when organization changes
			if (initialLoadComplete.value) {
				clearTeam();
			}

			// Fetch teams for new organization
			await fetchTeams(newOrgId);

			// For regular users with a single team, auto-select it
			if (isRegularUserWithSingleTeam.value && singleTeam.value) {
				setTeam(singleTeam.value.id);
			}
			// For other cases, let useTeams.js handle the restoration logic

			// Only try to restore from storage on initial load
			if (!initialLoadComplete.value) {
				console.log('TeamSelect: Initial load, checking for saved team in storage');
				initialLoadComplete.value = true;
			}
		}
	},
	{ immediate: true },
);

// Watch for team list changes
watch(
	() => visibleTeams.value,
	(newTeams) => {
		console.log('TeamSelect: Teams updated, count:', newTeams?.length || 0);

		// For regular users with a single team, auto-select it
		if (isRegularUserWithSingleTeam.value && singleTeam.value) {
			setTeam(singleTeam.value.id);
		}

		// Validate if the currently selected team is valid for this organization
		if (selectedTeam.value && !isTeamValidForCurrentOrg(selectedTeam.value)) {
			console.log('TeamSelect: Selected team is not valid for current organization, clearing team selection');
			clearTeam();
		}
	},
);

const handleEscKey = (e) => {
	if (e.key === 'Escape' && isDropdownOpen.value) {
		isDropdownOpen.value = false;
	}
};

onMounted(async () => {
	console.log('TeamSelect mounted, selectedOrg:', selectedOrg.value);

	if (selectedOrg.value) {
		console.log('TeamSelect: Initial fetch for org:', selectedOrg.value);
		await fetchTeams(selectedOrg.value);

		// For regular users with a single team, auto-select it
		if (isRegularUserWithSingleTeam.value && singleTeam.value) {
			setTeam(singleTeam.value.id);
		}

		initialLoadComplete.value = true;
	}

	// Add event listener
	document.addEventListener('keydown', handleEscKey);
});

onUnmounted(() => {
	document.removeEventListener('keydown', handleEscKey);
});
</script>

<style scoped>
.team-selector {
	position: relative; /* For dropdown positioning */
}

/* Animation for team selection */
.team-selector button img,
.team-selector button .w-5 {
	transition: transform 0.2s ease;
}

.team-selector button:hover img,
.team-selector button:hover .w-5 {
	transform: scale(1.05);
}

/* Custom scrollbar for dropdown */
.max-h-60 {
	scrollbar-width: thin;
	scrollbar-color: #cbd5e0 #f7fafc;
}

.max-h-60::-webkit-scrollbar {
	width: 6px;
}

.max-h-60::-webkit-scrollbar-track {
	background: #f7fafc;
}

.max-h-60::-webkit-scrollbar-thumb {
	background-color: #cbd5e0;
	border-radius: 6px;
}
</style>
