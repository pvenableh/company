<script setup lang="ts">
/**
 * Channels glance card — a compact home-dashboard surface that surfaces the
 * org's channels with live unread badges and links out to the canonical comms
 * hub at /apps/channels. Replaces the old full-inline RealtimeChat widget now
 * that the AppRail Channels app is the place chat lives (project_channels_apps_home).
 */
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

const { selectedOrg, organizationOptions } = useOrganization();
const unread = useChannelUnread();

const channelFilter = computed(() => {
	const filters: any[] = [{ status: { _eq: 'published' } }];
	if (selectedOrg.value) {
		filters.push({ organization: { _eq: selectedOrg.value } });
	} else if (organizationOptions.value?.length) {
		filters.push({ organization: { _in: organizationOptions.value.filter((o) => o.id).map((o) => o.id) } });
	}
	return { _and: filters };
});

const {
	data: channels,
	isLoading,
	updateFilter,
} = useRealtimeSubscription(
	'channels',
	['id', 'name', 'audience', 'messages.status', 'messages.date_created'],
	channelFilter.value,
	'name',
);
watch(channelFilter, (f) => updateFilter(f));

const cleanName = (name?: string | null) => (name ? String(name).replace(/^#+/, '') : '');
const channelHref = (name: string) => `/apps/channels/${encodeURIComponent(name)}`;
const unreadLabel = (n: number) => (n > 99 ? '99+' : String(n));

// Recency = newest published message; fall back to 0 so empty channels sink.
const lastActivity = (ch: any) => {
	const dates = (ch.messages || [])
		.filter((m: any) => m.status === 'published' && m.date_created)
		.map((m: any) => +new Date(m.date_created));
	return dates.length ? Math.max(...dates) : 0;
};

// Unread channels first (most-unread on top), then most-recent activity. Top 6.
const rows = computed(() =>
	(channels.value || [])
		.filter((c: any) => c.name)
		.map((c: any) => ({ ...c, _unread: unread.countFor(c.id), _act: lastActivity(c) }))
		.sort((a: any, b: any) => (b._unread > 0 ? 1 : 0) - (a._unread > 0 ? 1 : 0) || b._unread - a._unread || b._act - a._act)
		.slice(0, 6),
);

const totalUnread = unread.total;

onMounted(() => unread.refresh());
</script>

<template>
	<div class="ios-card flex flex-col overflow-hidden">
		<!-- Header -->
		<NuxtLink
			to="/apps/channels"
			class="flex items-center justify-between p-3 border-b border-border/30 hover:bg-muted/20 transition-colors"
		>
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
					<Icon name="lucide:hash" class="w-4 h-4 text-primary" />
				</div>
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground">Channels</h3>
				<span
					v-if="totalUnread > 0"
					class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground"
				>{{ unreadLabel(totalUnread) }}</span>
			</div>
			<span class="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
				Open
				<Icon name="lucide:chevron-right" class="w-3.5 h-3.5" />
			</span>
		</NuxtLink>

		<!-- Body -->
		<div class="p-2">
			<div v-if="isLoading" class="space-y-1">
				<div v-for="n in 4" :key="n" class="h-9 rounded-lg animate-pulse bg-muted/20" />
			</div>

			<template v-else-if="rows.length">
				<NuxtLink
					v-for="ch in rows"
					:key="ch.id"
					:to="channelHref(ch.name)"
					class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/30 transition-colors"
				>
					<Icon
						v-if="ch.audience === 'restricted'"
						name="lucide:lock"
						class="w-3 h-3 shrink-0 text-muted-foreground/50"
					/>
					<span v-else class="text-muted-foreground/40 text-sm shrink-0">#</span>
					<span
						class="flex-1 min-w-0 text-sm truncate"
						:class="ch._unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'"
					>{{ cleanName(ch.name) }}</span>
					<span
						v-if="ch._unread"
						class="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-primary text-primary-foreground"
					>{{ unreadLabel(ch._unread) }}</span>
				</NuxtLink>
			</template>

			<!-- Empty -->
			<div v-else class="flex flex-col items-center justify-center text-center py-8 px-4">
				<div class="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center mb-2">
					<Icon name="lucide:messages-square" class="w-5 h-5 text-muted-foreground/40" />
				</div>
				<p class="text-sm text-muted-foreground">No channels yet</p>
				<NuxtLink
					to="/apps/channels"
					class="mt-2 text-xs text-primary hover:underline"
				>Start a conversation</NuxtLink>
			</div>
		</div>
	</div>
</template>
