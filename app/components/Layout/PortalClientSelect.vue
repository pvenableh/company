<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, Users, ChevronDown } from 'lucide-vue-next';

defineProps<{
	user?: any;
}>();

const emit = defineEmits<{
	(e: 'open-org-switcher'): void;
}>();

const config = useRuntimeConfig();
const { selectedClient, setClient } = useClients();

interface ScopeClient {
	id: string;
	name: string;
	logo: string | null;
}

const scope = ref<{ root: ScopeClient | null; descendants: ScopeClient[] }>({
	root: null,
	descendants: [],
});
const loading = ref(true);

async function loadScope() {
	try {
		loading.value = true;
		scope.value = await $fetch('/api/portal/scope');
		// Item 11 — when there's only one client (no sub-brand descendants), the
		// "All" filter is meaningless: there's nothing else to filter against.
		// Lock the selection to the root so list pages render that client's
		// items immediately instead of showing the "All" placeholder state.
		if (scope.value.root && scope.value.descendants.length === 0) {
			if (selectedClient.value !== scope.value.root.id) {
				setClient(scope.value.root.id);
			}
		}
	} catch {
		scope.value = { root: null, descendants: [] };
	} finally {
		loading.value = false;
	}
}

const getIconUrl = (client: ScopeClient | null) => {
	if (!client?.logo) return undefined;
	return `${config.public.directusUrl}/assets/${client.logo}?key=avatar`;
};

const getInitials = (client: ScopeClient | null) => {
	if (!client?.name) return '';
	return client.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
};

const displayClient = computed<ScopeClient | null>(() => {
	if (!selectedClient.value || selectedClient.value === 'org') {
		return scope.value.root;
	}
	if (selectedClient.value === scope.value.root?.id) return scope.value.root;
	const desc = scope.value.descendants.find((c) => c.id === selectedClient.value);
	return desc ?? scope.value.root;
});

const displayLabel = computed(() => {
	if (!selectedClient.value) return 'All';
	return displayClient.value?.name ?? 'All';
});

onMounted(() => {
	loadScope();
});
</script>

<template>
	<div v-if="scope.root" class="flex items-center gap-1.5">
		<!-- Root client avatar — clickable to surface the org switcher / upsell -->
		<button
			class="flex items-center rounded-full border-2 border-[var(--cyan)] p-0.5 shadow-inner overflow-hidden transition-opacity cursor-pointer hover:opacity-80"
			:title="`Switch organization`"
			@click="emit('open-org-switcher')"
		>
			<Avatar class="size-7">
				<AvatarImage v-if="getIconUrl(scope.root)" :src="getIconUrl(scope.root)" :alt="scope.root.name" />
				<AvatarFallback class="text-xs font-medium">
					{{ getInitials(scope.root) }}
				</AvatarFallback>
			</Avatar>
		</button>

		<!-- Single-client portal: no choices to make — just show the name as a
		     read-only chip so users still see context without a dead dropdown. -->
		<div
			v-if="scope.descendants.length === 0"
			class="flex items-center gap-1 rounded-full bg-white border border-gray-200 text-[9px] uppercase tracking-wider font-medium text-gray-700 p-0.5 sm:px-2 sm:py-1 max-w-[180px]"
		>
			<div class="size-6 sm:size-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
				<img
					v-if="getIconUrl(scope.root)"
					:src="getIconUrl(scope.root)"
					:alt="scope.root.name"
					class="size-6 sm:size-5 object-contain rounded-full"
				/>
				<span v-else class="font-medium text-gray-700 text-[8px]">{{ getInitials(scope.root) }}</span>
			</div>
			<span class="truncate hidden sm:inline">{{ scope.root.name }}</span>
		</div>

		<!-- Client filter dropdown — root + descendants -->
		<DropdownMenu v-else>
			<DropdownMenuTrigger as-child>
				<button
					class="flex items-center gap-1 rounded-full bg-white border border-gray-200 hover:border-[var(--cyan)] transition-colors text-[9px] uppercase tracking-wider font-medium text-gray-700 p-0.5 sm:px-2 sm:py-1 max-w-[180px]"
				>
					<div class="size-6 sm:size-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
						<template v-if="displayClient && selectedClient">
							<img
								v-if="getIconUrl(displayClient)"
								:src="getIconUrl(displayClient)"
								:alt="displayClient.name"
								class="size-6 sm:size-5 object-contain rounded-full"
							/>
							<span v-else class="font-medium text-gray-700 text-[8px]">{{ getInitials(displayClient) }}</span>
						</template>
						<Building2 v-else class="size-3 text-gray-400" />
					</div>
					<span class="truncate hidden sm:inline">{{ displayLabel }}</span>
					<ChevronDown class="size-3 text-gray-400 shrink-0 hidden sm:block" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" class="w-64 client-select-dropdown">
				<DropdownMenuLabel class="text-xs uppercase text-muted-foreground">
					Filter by Client
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<div v-if="loading" class="flex items-center justify-center py-4">
					<UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-400" />
				</div>

				<div v-else class="max-h-60 overflow-y-auto">
					<!-- "All" option (root + descendants) -->
					<DropdownMenuItem
						class="flex items-center gap-3 cursor-pointer"
						:class="{ 'bg-accent': !selectedClient }"
						@click="setClient(null)"
					>
						<div class="size-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
							<Users class="size-3.5 text-gray-500" />
						</div>
						<span class="text-[9px] uppercase leading-3 flex-1 font-medium">All</span>
					</DropdownMenuItem>

					<!-- Root client -->
					<DropdownMenuItem
						v-if="scope.root"
						class="flex items-center gap-3 cursor-pointer"
						:class="{ 'bg-accent': selectedClient === scope.root.id }"
						@click="setClient(scope.root.id)"
					>
						<div
							class="shrink-0 rounded-full"
							:class="{ 'ring-2 ring-[var(--cyan)]': selectedClient === scope.root.id }"
						>
							<Avatar class="size-6">
								<AvatarImage v-if="getIconUrl(scope.root)" :src="getIconUrl(scope.root)" :alt="scope.root.name" />
								<AvatarFallback class="text-[10px] font-medium">
									{{ getInitials(scope.root) }}
								</AvatarFallback>
							</Avatar>
						</div>
						<span class="text-[9px] uppercase leading-3 flex-1">{{ scope.root.name }}</span>
					</DropdownMenuItem>

					<!-- Descendant clients -->
					<DropdownMenuItem
						v-for="desc in scope.descendants"
						:key="desc.id"
						class="flex items-center gap-3 cursor-pointer"
						:class="{ 'bg-accent': selectedClient === desc.id }"
						@click="setClient(desc.id)"
					>
						<div
							class="shrink-0 rounded-full"
							:class="{ 'ring-2 ring-[var(--cyan)]': selectedClient === desc.id }"
						>
							<Avatar class="size-6">
								<AvatarImage v-if="getIconUrl(desc)" :src="getIconUrl(desc)" :alt="desc.name" />
								<AvatarFallback class="text-[10px] font-medium">
									{{ getInitials(desc) }}
								</AvatarFallback>
							</Avatar>
						</div>
						<span class="text-[9px] uppercase leading-3 flex-1">{{ desc.name }}</span>
					</DropdownMenuItem>
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
