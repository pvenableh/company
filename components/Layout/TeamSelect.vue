<template>
	<div :class="containerClass" class="team-selector">
		<!-- When organization is selected -->
		<div v-if="selectedOrg">
			<!-- Team Dropdown -->
			<DropdownMenu>
				<DropdownMenuTrigger as-child>
					<button
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
							<Users v-else class="size-4 text-gray-400" />
						</div>

						<!-- Team Name (visible on larger screens) -->
						<span class="hidden md:block text-xs uppercase truncate max-w-24">
							{{ currentTeamName }}
						</span>

						<ChevronDown class="size-3 text-gray-400 hidden md:block" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="start" class="w-64">
					<DropdownMenuLabel class="text-xs uppercase text-muted-foreground">Teams</DropdownMenuLabel>
					<DropdownMenuSeparator />

					<!-- Loading State -->
					<div v-if="loading" class="py-4 flex justify-center">
						<Loader2 class="size-5 animate-spin text-muted-foreground" />
					</div>

					<!-- Empty Teams State -->
					<div v-else-if="!teamOptions.length" class="py-4 px-3 text-sm text-gray-500">
						<p class="text-[11px] uppercase leading-3">No teams available for this organization</p>
					</div>

					<!-- Teams List -->
					<div v-else class="max-h-60 overflow-y-auto">
						<!-- See All Option - Available for all users with multiple teams -->
						<DropdownMenuItem
							v-if="showClearTeamOption"
							class="flex items-center gap-3 cursor-pointer border-b border-gray-200 dark:border-gray-700 rounded-none"
							@click="clearTeamSelection"
						>
							<Eye class="size-4 shrink-0 text-gray-500" />
							<span class="text-[11px] uppercase leading-3 truncate text-gray-500">See All</span>
						</DropdownMenuItem>

						<!-- Team Options -->
						<DropdownMenuItem
							v-for="option in teamOptions"
							:key="option.id || 'all-teams'"
							class="flex items-center gap-3 cursor-pointer"
							:class="{ 'bg-blue-50 dark:bg-blue-900': selectedTeam === option.id }"
							@click="handleTeamSelect(option.id)"
						>
							<!-- Team Icon/Avatar -->
							<Users v-if="option.isAll" class="size-4 shrink-0" />
							<div v-else-if="getTeamIcon(option)" class="size-4 rounded-full shrink-0">
								<img
									:src="getTeamIcon(option)"
									:alt="`${option.name} Icon`"
									class="h-full w-full object-cover rounded-full"
								/>
							</div>
							<div v-else class="size-4 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
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
						</DropdownMenuItem>
					</div>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Users, ChevronDown, Loader2, Eye } from 'lucide-vue-next'

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
	showAllTeamsOption,
} = useTeams();
const { selectedOrg, currentOrg } = useOrganization();
const { user } = useDirectusAuth();
const $config = useRuntimeConfig();

const initialLoadComplete = ref(false);

// Check if user is a regular user (non-admin) with only one team
const isRegularUserWithSingleTeam = computed(() => {
	if (hasAdminAccess(user.value)) return false;
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

// Show "See All" option when a team is selected
const showClearTeamOption = computed(() => {
	return selectedTeam.value !== null && visibleTeams.value?.length >= 1;
});

// Computed for team options in dropdown with proper reactivity
const teamOptions = computed(() => {
	if (!selectedOrg.value) return [];
	const allTeamsOption = getAllTeamsOption();
	if (!visibleTeams.value || visibleTeams.value.length === 0) {
		return allTeamsOption;
	}
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
	if (selectedTeam.value === null) return 'See All';
	const team = visibleTeams.value.find((t) => t.id === selectedTeam.value);
	return team?.name || 'Select Team';
});

// Get team icon URL
const getTeamIcon = (team) => {
	if (!team || !team.id) return null;
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
		.substring(0, 2);
};

// Handle team selection
const handleTeamSelect = (teamId) => {
	if (teamId !== selectedTeam.value) {
		setTeam(teamId);
	}
};

// Clear/reset team selection (See All)
const clearTeamSelection = () => {
	clearTeam();
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
			if (initialLoadComplete.value) {
				clearTeam();
			}
			await fetchTeams(newOrgId);
			if (isRegularUserWithSingleTeam.value && singleTeam.value) {
				setTeam(singleTeam.value.id);
			}
			if (!initialLoadComplete.value) {
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
		if (isRegularUserWithSingleTeam.value && singleTeam.value) {
			setTeam(singleTeam.value.id);
		}
		if (selectedTeam.value && !isTeamValidForCurrentOrg(selectedTeam.value)) {
			clearTeam();
		}
	},
);

onMounted(async () => {
	if (selectedOrg.value) {
		await fetchTeams(selectedOrg.value);
		if (isRegularUserWithSingleTeam.value && singleTeam.value) {
			setTeam(singleTeam.value.id);
		}
		initialLoadComplete.value = true;
	}
});
</script>

<style scoped>
.team-selector {
	position: relative;
}

.team-selector button img {
	transition: transform 0.2s ease;
}

.team-selector button:hover img {
	transform: scale(1.05);
}
</style>
