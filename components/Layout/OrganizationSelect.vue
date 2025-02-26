<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { onClickOutside } from '@vueuse/core';

const { selectedOrg, organizationOptions, hasMultipleOrgs, setOrganization } = useOrganization();
const config = useRuntimeConfig();

// Create a local ref for organization display
const localSelectedOrg = ref(selectedOrg.value);
const isDropdownOpen = ref(false);
const dropdownRef = ref(null);

// Set default organization if needed
onMounted(() => {
	if (!selectedOrg.value && organizationOptions.value.length > 0) {
		const defaultOrg = organizationOptions.value[0].id;
		setOrganization(defaultOrg);
		localSelectedOrg.value = defaultOrg;
	}
});

watch(selectedOrg, (newVal) => {
	localSelectedOrg.value = newVal;
});

const handleOrgSelect = (orgId) => {
	console.log('Selected organization ID:', orgId);
	setOrganization(orgId);
	isDropdownOpen.value = false;
};

// Computed property to get the current organization
const currentOrg = computed(() => {
	return organizationOptions.value.find((org) => org.id === selectedOrg.value) || organizationOptions.value[0];
});

// Get logo URL for an organization
const getLogoUrl = (org) => {
	if (!org?.logo) return null;
	return `${config.public.directusUrl}/assets/${org.logo}?key=small`;
};

// Check if organization is the "All Organizations" option
const isAllOrganizations = (org) => {
	return org.id === null || org.id === 'all';
};

const toggleDropdown = () => {
	isDropdownOpen.value = !isDropdownOpen.value;
};

// Close dropdown when clicking outside
onClickOutside(dropdownRef, () => {
	isDropdownOpen.value = false;
});

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
</script>

<template>
	<div :class="containerClass" class="org-selector">
		<!-- Single Organization Display -->
		<div v-if="!hasMultipleOrgs" class="flex items-center">
			<UAvatar
				:src="getLogoUrl(user.organizations?.[0]?.organizations_id)"
				:alt="user.organizations?.[0]?.organizations_id?.name || 'Organization'"
				size="sm"
			/>
		</div>

		<!-- Multiple Organizations Selector - Custom Dropdown -->
		<div v-else class="relative" ref="dropdownRef">
			<!-- Dropdown Trigger -->
			<button @click="toggleDropdown" class="flex items-center group focus:outline-none">
				<!-- Show icon for "All Organizations" or avatar for specific organization -->
				<template v-if="isAllOrganizations(currentOrg)">
					<div class="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shadow">
						<UIcon name="i-heroicons-building-office-2" class="h-5 w-5 text-gray-500 dark:text-gray-300" />
					</div>
				</template>
				<UAvatar
					v-else
					:src="getLogoUrl(currentOrg)"
					:alt="currentOrg?.name || 'Organization'"
					class="h-8 !w-8 shadow"
				/>
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
							class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
							:class="{ 'bg-blue-50 dark:bg-blue-900': selectedOrg?.value && org.id === selectedOrg.value }"
						>
							<!-- Show icon for "All Organizations" or avatar for specific organization -->
							<template v-if="isAllOrganizations(org)">
								<div class="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
									<UIcon name="i-heroicons-building-office-2" class="h-5 w-5 text-gray-500 dark:text-gray-300" />
								</div>
							</template>
							<UAvatar v-else :src="getLogoUrl(org)" :alt="org.name" size="sm" class="flex-shrink-0" />
							<span class="text-sm">{{ org.name }}</span>
						</button>
					</div>
				</div>
			</Transition>
		</div>
	</div>
</template>

<style scoped>
.org-selector {
	position: relative;
}
</style>
