<!--
  ActiveClientCarousel — command-center widget.

  Horizontally scrollable strip of the most-recently-active clients in
  the current org. Sorts by the denormalized `clients.last_activity_at`
  (bumped by /api/clients/bump-activity + setup-client-activity.ts).

  Card click opens the ClientDetailPanel slide-over in apps mode, or
  navigates to /apps/clients/[id] in classic mode.
-->
<script setup lang="ts">
const { selectedOrg } = useOrganization();
const { selectedClient } = useClients();
const { isAppsMode } = useAppsMode();
const clientSlide = useAppSlideOver('client');
const router = useRouter();
const items = useDirectusItems('clients');

const clients = ref<any[]>([]);
const loading = ref(true);

// When the header is scoped to a single client (or "Org"), this widget
// loses its meaning — you've already drilled into one. Caller can v-if
// on this to hide the section entirely.
const isScoped = computed(() => selectedClient.value !== null);
defineExpose({ isScoped });

async function load() {
	if (!selectedOrg.value) {
		clients.value = [];
		loading.value = false;
		return;
	}
	loading.value = true;
	try {
		clients.value = await items.list({
			fields: ['id', 'name', 'logo', 'status', 'last_activity_at', 'date_updated'],
			filter: {
				organization: { _eq: selectedOrg.value },
				status: { _neq: 'archived' },
			},
			sort: ['-last_activity_at', '-date_updated', 'name'],
			limit: 12,
		}) as any[];
	} catch (err) {
		console.error('[ActiveClientCarousel] load failed:', err);
		clients.value = [];
	} finally {
		loading.value = false;
	}
}

watch(selectedOrg, load, { immediate: true });

const { getUrl: getFileUrl } = useDirectusFiles();

function openClient(id: string) {
	if (isAppsMode.value) {
		clientSlide.open(id);
	} else {
		router.push(`/apps/clients/${id}`);
	}
}

function relTime(iso: string | null | undefined) {
	if (!iso) return null;
	try {
		const d = new Date(iso).getTime();
		const diff = Date.now() - d;
		const mins = Math.round(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m`;
		const hrs = Math.round(mins / 60);
		if (hrs < 24) return `${hrs}h`;
		const days = Math.round(hrs / 24);
		if (days < 14) return `${days}d`;
		const weeks = Math.round(days / 7);
		if (weeks < 8) return `${weeks}w`;
		const months = Math.round(days / 30);
		return `${months}mo`;
	} catch { return null; }
}
</script>

<template>
	<!-- Hide entirely when the header has scoped to a single client / org —
	     showing "Active Clients" with one row would be redundant. -->
	<div v-if="!isScoped" class="ios-card p-5">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-building-office-2" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70">Active Clients</h3>
			</div>
			<UiViewLink to="/apps/clients" variant="muted" size="sm">All clients</UiViewLink>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex gap-3 overflow-hidden">
			<div v-for="i in 4" :key="i" class="shrink-0 w-44 h-28 rounded-xl bg-muted animate-pulse" />
		</div>

		<!-- Empty -->
		<div v-else-if="!clients.length" class="flex items-center gap-3 py-1">
			<div class="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center flex-shrink-0">
				<UIcon name="i-heroicons-building-office-2" class="w-4 h-4 text-muted-foreground/60" />
			</div>
			<div>
				<p class="text-sm text-foreground/80 font-medium">No active clients yet</p>
				<p class="text-[11px] text-muted-foreground mt-0.5">Activity bumps here as projects, tickets, and meetings move.</p>
			</div>
		</div>

		<!-- Carousel -->
		<div v-else class="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
			<button
				v-for="client in clients"
				:key="client.id"
				type="button"
				class="shrink-0 w-44 rounded-xl border border-border bg-background hover:bg-muted/40 transition-colors p-3 text-left group"
				@click="openClient(client.id)"
			>
				<div class="flex items-center gap-2 mb-2">
					<div class="w-8 h-8 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0">
						<img
							v-if="client.logo"
							:src="getFileUrl(client.logo)"
							:alt="client.name"
							class="w-full h-full object-cover"
						/>
						<UIcon v-else name="i-heroicons-building-office" class="w-4 h-4 text-muted-foreground" />
					</div>
					<p class="text-sm font-medium text-foreground truncate flex-1">{{ client.name }}</p>
					<ClientsClientRatingBadge :client-id="client.id" size="xs" />
				</div>
				<div class="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
					<span v-if="client.status" class="truncate">{{ client.status }}</span>
					<span v-if="relTime(client.last_activity_at || client.date_updated)" class="ml-auto shrink-0">
						{{ relTime(client.last_activity_at || client.date_updated) }} ago
					</span>
				</div>
			</button>
		</div>
	</div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { height: 4px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
</style>
