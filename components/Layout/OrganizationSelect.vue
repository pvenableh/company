<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Building2, Check } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

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

const isLoading = ref(false);

onMounted(async () => {
	isLoading.value = true;
	try {
		await fetchOrganizationDetails();

		if (!selectedOrg.value && organizationOptions.value.length > 1) {
			const defaultOrg = organizationOptions.value[1]?.id;
			if (defaultOrg) {
				setOrganization(defaultOrg);
			}
		}
	} catch (err) {
		console.error('Error initializing organization selector:', err);
		toast.error('Failed to load organization data. Please try refreshing the page.');
	} finally {
		isLoading.value = false;
	}
});

const handleOrgSelect = (orgId) => {
	if (orgId === null && !hasAdminAccess(props.user)) {
		toast.warning('Only administrators can view all organizations.');
		return;
	}
	setOrganization(orgId);
};

const getIconUrl = (org) => {
	if (!org?.icon) return null;
	return `${config.public.directusUrl}/assets/${org.icon}?key=avatar`;
};

const isAllOrganizations = (org) => {
	return org?.id === null || org?.id === 'all';
};

const getOrgInitials = (org) => {
	if (!org?.name) return '';
	return org.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
};

let cleanupListeners = null;

onMounted(() => {
	cleanupListeners = useOrganization().setupListeners();
});

onUnmounted(() => {
	if (cleanupListeners) {
		cleanupListeners();
	}
});
</script>

<template>
	<div :class="containerClass" class="org-selector">
		<!-- Single Organization Display -->
		<div
			v-if="!hasMultipleOrgs && organizations.length > 0"
			class="flex items-center rounded-full border-2 border-[var(--cyan)] p-0.5 shadow-inner overflow-hidden"
		>
			<Avatar class="size-7">
				<AvatarImage :src="getIconUrl(organizations[0])" :alt="organizations[0]?.name" />
				<AvatarFallback class="text-xs font-medium">
					{{ getOrgInitials(organizations[0]) }}
				</AvatarFallback>
			</Avatar>
		</div>

		<!-- Multiple Organizations Selector -->
		<DropdownMenu v-else-if="hasMultipleOrgs">
			<DropdownMenuTrigger as-child>
				<button
					class="flex items-center group relative focus:outline-none rounded-full bg-white border-2 border-[var(--cyan)] p-0.5 shadow-inner overflow-hidden"
				>
					<template v-if="isAllOrganizations(currentOrg)">
						<div class="size-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
							<Building2 class="size-4 text-gray-500 dark:text-gray-300" />
						</div>
					</template>
					<Avatar v-else class="size-7">
						<AvatarImage :src="getIconUrl(currentOrg)" :alt="currentOrg?.name" />
						<AvatarFallback class="text-xs font-medium">
							{{ getOrgInitials(currentOrg) }}
						</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" class="w-64 org-selector-dropdown">
				<DropdownMenuLabel class="text-xs uppercase text-muted-foreground">Organizations</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div class="max-h-60 overflow-y-auto">
					<DropdownMenuItem
						v-for="org in organizationOptions"
						:key="org.id || 'all'"
						class="flex items-center gap-3 cursor-pointer"
						@click="handleOrgSelect(org.id)"
					>
						<!-- All Organizations icon -->
						<template v-if="isAllOrganizations(org) && hasAdminAccess(user)">
							<div class="size-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
								<Building2 class="size-3.5 text-gray-500 dark:text-gray-300" />
							</div>
							<span class="text-[9px] uppercase leading-3 flex-1">{{ org.name }}</span>
							<span class="text-[7px] text-[var(--cyan)] uppercase">Admin Only</span>
						</template>

						<!-- Specific organization -->
						<template v-else-if="!isAllOrganizations(org)">
							<div
								class="shrink-0 rounded-full"
								:class="{ 'ring-2 ring-[var(--cyan)]': selectedOrg && org.id === selectedOrg }"
							>
								<Avatar class="size-6">
									<AvatarImage :src="getIconUrl(org)" :alt="org.name" />
									<AvatarFallback class="text-[10px] font-medium">
										{{ getOrgInitials(org) }}
									</AvatarFallback>
								</Avatar>
							</div>
							<span class="text-[9px] uppercase leading-3 flex-1">{{ org.name }}</span>

							<!-- Activity badges -->
							<div
								v-if="org.ticketsCount > 0 || org.projectsCount > 0"
								class="flex flex-col gap-0.5 items-end"
							>
								<span v-if="org.ticketsCount > 0" class="text-[7px] text-[var(--cyan)]">
									{{ org.ticketsCount }} Ticket{{ org.ticketsCount > 1 ? 's' : '' }}
								</span>
								<span v-if="org.projectsCount > 0" class="text-[7px] text-green-500">
									{{ org.projectsCount }} Project{{ org.projectsCount > 1 ? 's' : '' }}
								</span>
							</div>

							<!-- Selected check -->
							<Check v-if="selectedOrg && org.id === selectedOrg" class="size-3.5 text-[var(--cyan)] shrink-0" />
						</template>
					</DropdownMenuItem>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</template>

<style scoped>
.org-selector :deep(img) {
	object-fit: contain;
}

.org-selector button img {
	transition: transform 0.2s ease;
}

.org-selector button:hover img {
	transform: scale(1.05);
}
</style>

<style>
/* Unscoped to reach teleported dropdown content */
.org-selector-dropdown img {
	object-fit: contain !important;
}
</style>
