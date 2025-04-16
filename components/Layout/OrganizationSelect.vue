<template>
	<div :class="containerClass" class="org-selector">
		<!-- Single Organization Display -->
		<div
			v-if="!hasMultipleOrgs"
			class="flex items-center rounded-full border-2 border-[var(--cyan)] p-1 shadow-inner overflow-hidden"
		>
			<UAvatar
				:src="getIconUrl(organizations[0])"
				:alt="organizations[0]?.name || 'Organization'"
				size="sm"
				class="h-7 !w-7 shadow-lg"
			>
				<template #fallback>
					<span class="text-xs font-medium">
						{{ getOrgInitials(organizations[0]) }}
					</span>
				</template>
			</UAvatar>
		</div>

		<!-- Multiple Organizations Selector - Custom Dropdown -->
		<div v-else class="relative" ref="dropdownRef">
			<!-- Dropdown Trigger -->
			<button
				@click="toggleDropdown"
				class="flex items-center group relative focus:outline-none rounded-full bg-white border-2 border-[var(--cyan)] p-0.5 shadow-inner overflow-hidden"
				:class="{ 'border-cyan-400': isDropdownOpen }"
			>
				<!-- Show icon for "All Organizations" or avatar for specific organization -->
				<template v-if="isAllOrganizations(currentOrg)">
					<div
						class="h-7 w-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center relative shadow-lg"
					>
						<UIcon name="i-heroicons-building-office-2" class="h-5 w-5 text-gray-500 dark:text-gray-300" />
					</div>
				</template>

				<UAvatar v-else :src="getIconUrl(currentOrg)" :alt="currentOrg?.name || 'Organization'" class="bg-white">
					<template #fallback>
						<span class="text-xs font-medium">{{ getOrgInitials(currentOrg) }}</span>
					</template>
				</UAvatar>
			</button>

			<!-- Custom Dropdown -->
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
					<div class="py-1 px-2 text-xs uppercase font-medium text-gray-600 dark:text-gray-400">Organizations</div>
					<div class="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
					<div class="max-h-60 overflow-y-auto">
						<button
							v-for="org in organizationOptions"
							:key="org.id || 'all'"
							@click="handleOrgSelect(org.id)"
							class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left relative"
							:class="{ 'bg-gray-100 dark:bg-gray-700': selectedOrg && org.id === selectedOrg }"
						>
							<!-- Show icon for "All Organizations" or avatar for specific organization -->
							<template v-if="isAllOrganizations(org)">
								<div class="rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
									<UIcon name="i-heroicons-building-office-2" class="h-5 w-5 text-gray-500 dark:text-gray-300" />
								</div>
								<!-- Add admin badge for All Organizations -->
								<span class="text-[7px] bg-purple-100 text-purple-800 px-1 rounded absolute right-3">Admin Only</span>
							</template>
							<div
								v-else
								class="flex items-center justify-center rounded-full"
								:class="{
									'border-2 border-[var(--cyan)] ': selectedOrg && org.id === selectedOrg,
								}"
							>
								<UAvatar :src="getIconUrl(org)" :alt="org.name" size="xs" class="">
									<template #fallback>
										<span class="text-xs font-medium">{{ getOrgInitials(org) }}</span>
									</template>
								</UAvatar>
							</div>
							<span class="text-[11px] uppercase leading-3">
								{{ org.name }}
							</span>
							<!-- Display activity count badges -->
							<div v-if="org.id && (org.ticketsCount > 0 || org.projectsCount > 0)" class="ml-auto flex gap-1">
								<span v-if="org.ticketsCount > 0" class="text-[7px] bg-blue-100 text-blue-800 px-1 rounded">
									{{ org.ticketsCount }} Ticket{{ org.ticketsCount > 1 ? 's' : '' }}
								</span>
								<span v-if="org.projectsCount > 0" class="text-[7px] bg-green-100 text-green-800 px-1 rounded">
									{{ org.projectsCount }} Project{{ org.projectsCount > 1 ? 's' : '' }}
								</span>
							</div>
						</button>
					</div>
				</div>
			</Transition>
		</div>
	</div>
</template>

<script setup>
import { onClickOutside } from '@vueuse/core';

const {
	selectedOrg,
	organizations,
	organizationOptions,
	hasMultipleOrgs,
	setOrganization,
	currentOrg,
	fetchOrganizationDetails,
} = useOrganization();
const { hasAdminAccess } = useTeams();
const config = useRuntimeConfig();
const toast = useToast();

// Local state
const isDropdownOpen = ref(false);
const dropdownRef = ref(null);

// Local state for loading status
const isLoading = ref(false);

// Set default organization if needed
onMounted(async () => {
	// Ensure organization data is fresh
	isLoading.value = true;
	try {
		await fetchOrganizationDetails();

		if (!selectedOrg.value && organizationOptions.value.length > 1) {
			// Skip the first "All Organizations" option and use the first real organization
			const defaultOrg = organizationOptions.value[1]?.id;
			if (defaultOrg) {
				setOrganization(defaultOrg);
			}
		}
	} catch (err) {
		console.error('Error initializing organization selector:', err);
		toast.add({
			title: 'Error',
			description: 'Failed to load organization data. Please try refreshing the page.',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
});

const handleOrgSelect = (orgId) => {
	// Check if user has admin access before allowing "All Organizations" selection
	// If selecting "All Organizations" (null) and user is not admin, prevent it
	if (orgId === null && !hasAdminAccess(props.user)) {
		toast.add({
			title: 'Permission Required',
			description: 'Only administrators can view all organizations.',
			color: 'yellow',
		});
		isDropdownOpen.value = false;
		return;
	}

	// Set the organization
	setOrganization(orgId);
	isDropdownOpen.value = false;
};

// Get icon URL for an organization
const getIconUrl = (org) => {
	if (!org?.icon) return null;
	return `${config.public.directusUrl}/assets/${org.icon}?key=avatar`;
};

// Check if organization is the "All Organizations" option
const isAllOrganizations = (org) => {
	return org?.id === null || org?.id === 'all';
};

const toggleDropdown = () => {
	isDropdownOpen.value = !isDropdownOpen.value;
};

// Close dropdown when clicking outside
onClickOutside(dropdownRef, () => {
	isDropdownOpen.value = false;
});

// Get organization initials when no icon is available
const getOrgInitials = (org) => {
	if (!org?.name) return '';

	return org.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2); // Up to 2 initials
};

const props = defineProps({
	user: {
		type: Object,
		default: null,
	},
	containerClass: {
		type: String,
		default: 'relative',
	},
});

// Setup Listeners for cross-tab synchronization
let cleanupListeners = null;

onMounted(() => {
	// Use the setupListeners method from the useOrganization composable
	cleanupListeners = useOrganization().setupListeners();

	// Close dropdown when ESC key is pressed
	const handleEscKey = (e) => {
		if (e.key === 'Escape' && isDropdownOpen.value) {
			isDropdownOpen.value = false;
		}
	};

	document.addEventListener('keydown', handleEscKey);

	// Clean up event listener
	onUnmounted(() => {
		document.removeEventListener('keydown', handleEscKey);
	});
});

onUnmounted(() => {
	if (cleanupListeners) {
		cleanupListeners();
	}
});
</script>

<style scoped>
.org-selector {
	position: relative;
}

/* Animation for organization selection */
.org-selector button img,
.org-selector button .w-5 {
	transition: transform 0.2s ease;
}

.org-selector button:hover img,
.org-selector button:hover .w-5 {
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
