<!--
	AppUpdateBanner — persistent "new version available" prompt.

	Replaces the easy-to-miss update toast. Driven by the shared useAppVersion
	state (the app-update.client.ts plugin polls /api/version and flips status to
	"outdated" when a newer deploy is live). Stays on screen until the user
	reloads, so a long-open tab can't silently sit on a stale build. Reload runs
	the cache-busting refresh() then hard-reloads.

	Dismiss hides it only for the current build id — if an even newer build ships,
	it reappears.
-->
<script setup lang="ts">
const { status, shortBuildId, liveBuildId, refresh } = useAppVersion();

const reloading = ref(false);
const dismissedBuild = ref<string | null>(null);

const visible = computed(
	() => status.value === 'outdated' && dismissedBuild.value !== liveBuildId.value,
);

async function onReload() {
	if (reloading.value) return;
	reloading.value = true;
	await refresh();
}

function dismiss() {
	dismissedBuild.value = liveBuildId.value;
}
</script>

<template>
	<Transition
		enter-active-class="transition duration-300 ease-out"
		enter-from-class="opacity-0 -translate-y-3"
		enter-to-class="opacity-100 translate-y-0"
		leave-active-class="transition duration-200 ease-in"
		leave-from-class="opacity-100 translate-y-0"
		leave-to-class="opacity-0 -translate-y-3"
	>
		<div
			v-if="visible"
			class="fixed left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 pl-4 pr-2 py-2 rounded-full glass-surface glass-surface--strong shadow-xl border border-border/60 max-w-[calc(100vw-24px)]"
			style="position: fixed; top: calc(env(safe-area-inset-top, 0px) + 12px)"
			role="status"
			aria-live="polite"
		>
			<span class="relative flex h-2 w-2 flex-shrink-0">
				<span class="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
				<span class="relative inline-flex h-2 w-2 rounded-full bg-primary" />
			</span>
			<span class="text-sm font-medium text-foreground whitespace-nowrap">
				New version available
			</span>
			<button
				type="button"
				:disabled="reloading"
				class="text-sm font-semibold px-3 py-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-wait flex-shrink-0"
				@click="onReload"
			>
				{{ reloading ? 'Reloading…' : 'Reload' }}
			</button>
			<button
				type="button"
				aria-label="Dismiss update notice"
				class="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex-shrink-0"
				@click="dismiss"
			>
				<UIcon name="i-heroicons-x-mark-20-solid" class="w-4 h-4" />
			</button>
		</div>
	</Transition>
</template>
