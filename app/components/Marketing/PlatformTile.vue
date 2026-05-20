<template>
	<NuxtLink
		:to="targetHref"
		class="rounded-xl border border-border/40 bg-card/40 p-3 hover:bg-muted/30 transition-colors group flex flex-col gap-2 min-h-[7rem]"
		:class="{ 'opacity-60 hover:opacity-100': !tile.connected }"
	>
		<div class="flex items-center gap-2">
			<Icon
				:name="iconName"
				class="w-8 h-8 shrink-0"
			/>
			<span class="text-xs font-semibold text-foreground capitalize">{{ tile.platform }}</span>
			<span
				v-if="tile.expired"
				class="ml-auto inline-flex items-center gap-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium"
			>
				<Icon name="lucide:link-2-off" class="w-2.5 h-2.5" />
				Expiring
			</span>
		</div>

		<template v-if="tile.connected">
			<div class="space-y-1">
				<p class="text-lg font-bold text-foreground tabular-nums leading-none">
					{{ formatNumber(tile.followers) }}
				</p>
				<p class="text-[10px] text-muted-foreground">followers</p>
			</div>
			<div class="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
				<span class="inline-flex items-center gap-1">
					<Icon name="lucide:send" class="w-2.5 h-2.5" />
					{{ tile.postsLastPeriod }}
				</span>
				<span v-if="tile.nextScheduledAt" class="inline-flex items-center gap-1">
					<Icon name="lucide:clock" class="w-2.5 h-2.5" />
					{{ relative(tile.nextScheduledAt) }}
				</span>
				<span v-else class="text-muted-foreground/60">No queue</span>
			</div>
		</template>

		<template v-else>
			<p class="text-[10px] text-muted-foreground leading-snug">
				Not connected
			</p>
			<button
				class="mt-auto inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium bg-foreground text-background group-hover:bg-foreground/90 transition-colors"
			>
				<Icon name="lucide:plus" class="w-2.5 h-2.5" />
				Connect
			</button>
		</template>
	</NuxtLink>
</template>

<script setup lang="ts">
import type { SocialPlatform } from '~~/shared/social';
import { getSocialPlatformIcon } from '~/utils/icons';

interface Tile {
	platform: SocialPlatform;
	connected: boolean;
	expired: boolean;
	accountName: string | null;
	accountHandle: string | null;
	followers: number;
	postsLastPeriod: number;
	nextScheduledAt: string | null;
}

const props = defineProps<{ tile: Tile }>();

const iconName = computed(() => getSocialPlatformIcon(props.tile.platform));

const targetHref = computed(() => {
	if (!props.tile.connected) return { path: '/social/settings' };
	return { path: '/social', query: { platform: props.tile.platform } };
});

function formatNumber(n: number): string {
	if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
	return String(n ?? 0);
}

function relative(iso: string): string {
	const ms = new Date(iso).getTime() - Date.now();
	const minutes = Math.round(ms / 60000);
	if (minutes <= 0) return 'now';
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h`;
	const days = Math.round(hours / 24);
	return `${days}d`;
}
</script>
