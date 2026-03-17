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
import { Building2, Users, ChevronDown } from 'lucide-vue-next'

const props = defineProps({
	user: {
		type: Object,
		default: null,
	},
});

const emit = defineEmits(['open-org-switcher']);

const { currentOrg, hasMultipleOrgs } = useOrganization();
const {
	selectedClient,
	clientOptions,
	currentClient,
	hasClients,
	clientsLoading,
	setClient,
	setupClientListeners,
} = useClients();
const config = useRuntimeConfig();

const getIconUrl = (item) => {
	const icon = item?.logo || item?.icon;
	if (!icon) return undefined;
	const assetId = typeof icon === 'object' ? icon.id : icon;
	if (!assetId) return undefined;
	return `${config.public.directusUrl}/assets/${assetId}?key=avatar`;
};

const getInitials = (item) => {
	if (!item?.name) return '';
	return item.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
};

const displayLabel = computed(() => {
	if (!selectedClient.value) return 'All';
	if (currentClient.value) return currentClient.value.name;
	return 'All';
});

let cleanupListeners = null;

onMounted(() => {
	cleanupListeners = setupClientListeners();
});

onUnmounted(() => {
	if (cleanupListeners) cleanupListeners();
});
</script>

<template>
	<div class="flex items-center gap-1.5">
		<!-- Org icon (clickable for multi-org users to open switcher) -->
		<button
			class="flex items-center rounded-full border-2 border-[var(--cyan)] p-0.5 shadow-inner overflow-hidden transition-opacity"
			:class="hasMultipleOrgs ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
			:title="hasMultipleOrgs ? 'Switch organization' : currentOrg?.name"
			@click="hasMultipleOrgs ? emit('open-org-switcher') : null"
		>
			<UserAvatar class="size-7">
				<AvatarImage v-if="getIconUrl(currentOrg)" :src="getIconUrl(currentOrg)" :alt="currentOrg?.name" />
				<AvatarFallback class="text-xs font-medium">
					{{ getInitials(currentOrg) }}
				</AvatarFallback>
			</UserAvatar>
		</button>

		<!-- Client dropdown -->
		<DropdownMenu>
			<DropdownMenuTrigger as-child>
				<button
					class="flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-gray-200 hover:border-[var(--cyan)] transition-colors text-[9px] uppercase tracking-wider font-medium text-gray-700 max-w-[180px]"
				>
					<div class="size-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
						<template v-if="currentClient && currentClient.id !== 'org'">
							<img
								v-if="getIconUrl(currentClient)"
								:src="getIconUrl(currentClient)"
								:alt="currentClient.name"
								class="size-5 object-contain rounded-full"
							/>
							<span v-else class="font-medium text-gray-700 text-[8px]">{{ getInitials(currentClient) }}</span>
						</template>
						<Building2 v-else class="size-3 text-gray-400" />
					</div>
					<span class="truncate">{{ displayLabel }}</span>
					<ChevronDown class="size-3 text-gray-400 shrink-0" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" class="w-64 client-select-dropdown">
				<DropdownMenuLabel class="text-xs uppercase text-muted-foreground">
					Filter by Client
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<div v-if="clientsLoading" class="flex items-center justify-center py-4">
					<UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-400" />
				</div>

				<div v-else class="max-h-60 overflow-y-auto">
					<DropdownMenuItem
						v-for="option in clientOptions"
						:key="option.id || 'all'"
						class="flex items-center gap-3 cursor-pointer"
						:class="{ 'bg-accent': selectedClient === option.id }"
						@click="setClient(option.id)"
					>
						<!-- "All" option -->
						<template v-if="option.id === null">
							<div class="size-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
								<Users class="size-3.5 text-gray-500" />
							</div>
							<span class="text-[9px] uppercase leading-3 flex-1 font-medium">All</span>
						</template>

						<!-- "Organization" option -->
						<template v-else-if="option.id === 'org'">
							<div class="shrink-0" :class="{ 'ring-2 ring-[var(--cyan)] rounded-full': selectedClient === 'org' }">
								<UserAvatar class="size-6">
									<AvatarImage v-if="getIconUrl(option)" :src="getIconUrl(option)" :alt="option.name" />
									<AvatarFallback class="text-[10px] font-medium">
										{{ getInitials(option) }}
									</AvatarFallback>
								</UserAvatar>
							</div>
							<span class="text-[9px] uppercase leading-3 flex-1">{{ option.name }}</span>
							<span class="text-[7px] text-[var(--cyan)] uppercase">Internal</span>
						</template>

						<!-- Client options -->
						<template v-else>
							<div
								class="shrink-0 rounded-full"
								:class="{ 'ring-2 ring-[var(--cyan)]': selectedClient === option.id }"
							>
								<UserAvatar class="size-6">
									<AvatarImage v-if="getIconUrl(option)" :src="getIconUrl(option)" :alt="option.name" />
									<AvatarFallback class="text-[10px] font-medium">
										{{ getInitials(option) }}
									</AvatarFallback>
								</UserAvatar>
							</div>
							<span class="text-[9px] uppercase leading-3 flex-1">{{ option.name }}</span>
						</template>
					</DropdownMenuItem>
				</div>

				<!-- No clients message -->
				<div v-if="!clientsLoading && !hasClients" class="px-3 py-2">
					<p class="text-xs text-gray-400">No active clients yet</p>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</template>

<style>
.client-select-dropdown img {
	object-fit: contain !important;
}
</style>
