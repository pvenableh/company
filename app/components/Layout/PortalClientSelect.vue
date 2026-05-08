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
const toast = useToast();
const { selectedClient, setClient } = useClients();
const { currentOrg } = useOrganization();

interface ScopeClient {
	id: string;
	name: string;
	logo: string | null;
}

interface ScopeRoot extends ScopeClient {
	descendants: ScopeClient[];
}

const scope = ref<{
	roots: ScopeRoot[];
	activeRootId: string | null;
}>({
	roots: [],
	activeRootId: null,
});
const loading = ref(true);
const switching = ref(false);

const activeRoot = computed<ScopeRoot | null>(
	() => scope.value.roots.find((r) => r.id === scope.value.activeRootId) ?? scope.value.roots[0] ?? null,
);

const hasMultipleRoots = computed(() => scope.value.roots.length > 1);

async function loadScope() {
	try {
		loading.value = true;
		const data = await $fetch<{
			activeRootId: string | null;
			roots: ScopeRoot[];
			// legacy fields ignored
		}>('/api/portal/scope');
		scope.value = {
			roots: data.roots ?? [],
			activeRootId: data.activeRootId ?? null,
		};
		// When there's only one client total (no descendants under the one root),
		// the "All" filter is meaningless. Lock the descendant filter to the
		// active root so list pages render its items immediately.
		if (
			activeRoot.value
			&& activeRoot.value.descendants.length === 0
			&& selectedClient.value !== activeRoot.value.id
		) {
			setClient(activeRoot.value.id);
		}
	} catch {
		scope.value = { roots: [], activeRootId: null };
	} finally {
		loading.value = false;
	}
}

async function switchRoot(rootId: string) {
	if (rootId === scope.value.activeRootId || switching.value) return;
	switching.value = true;
	try {
		await $fetch('/api/portal/set-active-scope', {
			method: 'POST',
			body: { clientId: rootId },
		});
		// Clear the descendant filter — the new root has its own subtree.
		setClient(null);
		// Hard reload so server-side data fetching picks up the new cookie.
		if (import.meta.client) window.location.reload();
	} catch (e: any) {
		const message = e?.data?.message || e?.message || 'Failed to switch client';
		toast.add({ title: 'Error', description: message, color: 'red' });
		switching.value = false;
	}
}

const getIconUrl = (entity: { logo?: string | null; icon?: string | null } | null) => {
	const id = entity?.logo ?? entity?.icon ?? null;
	if (!id) return undefined;
	return `${config.public.directusUrl}/assets/${id}?key=avatar`;
};

const getInitials = (entity: { name?: string | null } | null) => {
	if (!entity?.name) return '';
	return entity.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
};

// What's showing in the trigger pill: the active root, or whichever
// descendant the user has filtered to.
const displayClient = computed<ScopeClient | null>(() => {
	if (!activeRoot.value) return null;
	if (!selectedClient.value || selectedClient.value === 'org' || selectedClient.value === activeRoot.value.id) {
		return activeRoot.value;
	}
	const desc = activeRoot.value.descendants.find((c) => c.id === selectedClient.value);
	return desc ?? activeRoot.value;
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
	<div v-if="activeRoot" class="flex items-center gap-1.5">
		<!-- Organization avatar — represents the agency/firm hosting this portal
		     (e.g. Hue). Clicking surfaces the org switcher / upsell so dual-role
		     users can flip between portals. The clients of this org sit in the
		     picker beside it. -->
		<button
			class="flex items-center rounded-full border-2 border-[var(--cyan)] p-0.5 shadow-inner overflow-hidden transition-opacity cursor-pointer hover:opacity-80"
			:title="currentOrg?.name ? `Switch organization (${currentOrg.name})` : 'Switch organization'"
			@click="emit('open-org-switcher')"
		>
			<Avatar class="size-7">
				<AvatarImage v-if="getIconUrl(currentOrg)" :src="getIconUrl(currentOrg)" :alt="currentOrg?.name ?? ''" />
				<AvatarFallback class="text-xs font-medium">
					{{ getInitials(currentOrg) }}
				</AvatarFallback>
			</Avatar>
		</button>

		<!-- Single-client portal: no choices to make — just show the name as a
		     read-only chip so users still see context without a dead dropdown. -->
		<div
			v-if="!hasMultipleRoots && activeRoot.descendants.length === 0"
			class="flex items-center gap-1 rounded-full bg-white border border-gray-200 text-[9px] uppercase tracking-wider font-medium text-gray-700 p-0.5 sm:px-2 sm:py-1 max-w-[180px]"
		>
			<div class="size-6 sm:size-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
				<img
					v-if="getIconUrl(activeRoot)"
					:src="getIconUrl(activeRoot)"
					:alt="activeRoot.name"
					class="size-6 sm:size-5 object-contain rounded-full"
				/>
				<span v-else class="font-medium text-gray-700 text-[8px]">{{ getInitials(activeRoot) }}</span>
			</div>
			<span class="truncate hidden sm:inline">{{ activeRoot.name }}</span>
		</div>

		<!-- Picker — shows when there are multiple roots OR descendants under one root -->
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

			<DropdownMenuContent align="start" class="w-72 client-select-dropdown">
				<DropdownMenuLabel class="text-xs uppercase text-muted-foreground">
					{{ hasMultipleRoots ? 'Your Clients' : 'Filter by Client' }}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<div v-if="loading" class="flex items-center justify-center py-4">
					<UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-400" />
				</div>

				<div v-else class="max-h-[26rem] overflow-y-auto">
					<template v-for="(root, rootIndex) in scope.roots" :key="root.id">
						<DropdownMenuSeparator v-if="rootIndex > 0" />

						<!-- Root row — highlighted with the brand ring; clicking switches
						     the active scope when it's a different root. -->
						<DropdownMenuItem
							class="flex items-center gap-3 cursor-pointer"
							:class="{ 'bg-accent': root.id === activeRoot?.id && (!selectedClient || selectedClient === root.id) }"
							:disabled="switching"
							@click="
								root.id === activeRoot?.id
									? setClient(root.id)
									: switchRoot(root.id)
							"
						>
							<div
								class="shrink-0 rounded-full"
								:class="{ 'ring-2 ring-[var(--cyan)]': root.id === activeRoot?.id }"
							>
								<Avatar class="size-6">
									<AvatarImage v-if="getIconUrl(root)" :src="getIconUrl(root)" :alt="root.name" />
									<AvatarFallback class="text-[10px] font-medium">
										{{ getInitials(root) }}
									</AvatarFallback>
								</Avatar>
							</div>
							<div class="flex-1 min-w-0">
								<span class="text-[9px] uppercase leading-3 font-medium block truncate">{{ root.name }}</span>
								<span v-if="root.id !== activeRoot?.id" class="text-[8px] text-muted-foreground/70 normal-case">
									Switch to this client
								</span>
							</div>
						</DropdownMenuItem>

						<!-- Descendants of the active root only — switching to a different
						     root reloads the page and the new tree gets rendered next time. -->
						<template v-if="root.id === activeRoot?.id">
							<DropdownMenuItem
								v-if="root.descendants.length > 0"
								class="flex items-center gap-3 cursor-pointer pl-8"
								:class="{ 'bg-accent': !selectedClient }"
								@click="setClient(null)"
							>
								<div class="size-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
									<Users class="size-3 text-gray-500" />
								</div>
								<span class="text-[9px] uppercase leading-3 flex-1">All ({{ root.name }} + sub-brands)</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								v-for="desc in root.descendants"
								:key="desc.id"
								class="flex items-center gap-3 cursor-pointer pl-8"
								:class="{ 'bg-accent': selectedClient === desc.id }"
								@click="setClient(desc.id)"
							>
								<div
									class="shrink-0 rounded-full"
									:class="{ 'ring-2 ring-[var(--cyan)]': selectedClient === desc.id }"
								>
									<Avatar class="size-5">
										<AvatarImage v-if="getIconUrl(desc)" :src="getIconUrl(desc)" :alt="desc.name" />
										<AvatarFallback class="text-[10px] font-medium">
											{{ getInitials(desc) }}
										</AvatarFallback>
									</Avatar>
								</div>
								<span class="text-[9px] uppercase leading-3 flex-1">{{ desc.name }}</span>
							</DropdownMenuItem>
						</template>
					</template>
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
