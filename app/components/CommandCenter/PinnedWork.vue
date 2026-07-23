<!--
  PinnedWork — "recommended work" rail for the home surface.

  Surfaces the projects and clients the user has explicitly pinned as the
  first thing on home. Renders nothing when nothing is pinned, so it only
  appears when it has something to say. Pin toggles live here too (unpin
  removes the card), and the same PinButton on the carousels / workspaces
  feeds this list.
-->
<script setup lang="ts">
const { items, hasPinned, loading, unpin } = usePinnedWork();
const projectSlide = useAppSlideOver('work-project');
const clientSlide = useAppSlideOver('client');
const { getUrl: getFileUrl } = useDirectusFiles();

function open(item: import('~/composables/usePinnedWork').PinnedWorkItem) {
	if (item.type === 'project') projectSlide.open(item.id);
	else clientSlide.open(item.id);
}

const TYPE_ICON: Record<string, string> = {
	project: 'i-heroicons-folder-open',
	client: 'i-heroicons-building-office-2',
};

function statusChip(s: string | null) {
	switch (s) {
		case 'In Progress': return 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
		case 'Scheduled': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
		case 'active': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
		case 'prospect': return 'bg-violet-500/15 text-violet-600 dark:text-violet-400';
		default: return 'bg-muted text-muted-foreground';
	}
}
</script>

<template>
	<!-- Only present when there's something pinned (or still checking). -->
	<div v-if="loading || hasPinned" class="ios-card p-5">
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<Icon name="mdi:pin" class="w-5 h-5 text-red-500" />
				<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70">Pinned work</h3>
			</div>
			<span class="text-[11px] text-muted-foreground">Recommended</span>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex gap-3 overflow-hidden">
			<div v-for="i in 3" :key="i" class="shrink-0 w-56 h-24 rounded-xl bg-muted animate-pulse" />
		</div>

		<!-- Cards -->
		<div v-else class="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
			<button
				v-for="item in items"
				:key="item.key"
				type="button"
				class="shrink-0 w-56 rounded-xl border border-border bg-background hover:bg-muted/40 transition-colors p-3 text-left group"
				@click="open(item)"
			>
				<div class="flex items-start gap-2 mb-2">
					<!-- Client logo, project accent dot, or type icon fallback. -->
					<img
						v-if="item.type === 'client' && item.logo"
						:src="getFileUrl(item.logo, { width: 48, height: 48, fit: 'cover' })"
						:alt="item.title"
						class="w-6 h-6 rounded-md object-cover shrink-0 mt-0.5"
					>
					<span
						v-else-if="item.type === 'project'"
						class="w-2 h-2 rounded-full mt-2 shrink-0"
						:style="{ backgroundColor: item.accent || 'var(--primary)' }"
					/>
					<UIcon v-else :name="TYPE_ICON[item.type]" class="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />

					<p class="text-sm font-medium text-foreground line-clamp-2 leading-snug flex-1">{{ item.title }}</p>
					<PinButton :pinned="true" always size="xs" @toggle="unpin(item)" />
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate">
						<UIcon :name="TYPE_ICON[item.type]" class="w-3 h-3 shrink-0" />
						{{ item.subtitle }}
					</span>
					<span
						v-if="item.status"
						class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 capitalize"
						:class="statusChip(item.status)"
					>
						{{ item.status }}
					</span>
				</div>
			</button>
		</div>
	</div>
</template>
