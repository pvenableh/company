<script setup>
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

const { user: directusUser } = useDirectusAuth();
const { hasAdminAccess } = useTeams();

const isAdmin = computed(() => hasAdminAccess(directusUser.value));

const activeView = ref('timeline');

definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<div class="page__content">
		<h1 class="page__title">
			Projects
			<span class="block">{{ activeView === 'timeline' ? 'Timeline' : 'Board' }}</span>
		</h1>

		<!-- View switcher -->
		<div v-if="isAdmin" class="flex items-center gap-1 px-4 2xl:px-0 mb-4">
			<button
				class="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-md transition-colors"
				:class="activeView === 'timeline'
					? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
					: 'text-gray-400 hover:text-gray-600'"
				@click="activeView = 'timeline'"
			>
				<Icon name="i-heroicons-map" class="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
				Timeline
			</button>
			<button
				class="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-md transition-colors"
				:class="activeView === 'board'
					? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
					: 'text-gray-400 hover:text-gray-600'"
				@click="activeView = 'board'"
			>
				<Icon name="i-heroicons-view-columns" class="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
				Board
			</button>
		</div>

		<div v-if="isAdmin">
			<!-- Timeline view -->
			<div v-if="activeView === 'timeline'" class="z-10 min-h-svh page__inner">
				<ProjectTimelineTimeline />
			</div>

			<!-- Board view -->
			<div v-else class="xl:flex xl:items-center xl:justify-center z-10 min-h-svh overflow-x-auto page__inner">
				<ProjectsBoard />
			</div>
		</div>
		<div v-else class="flex flex-col items-center justify-center z-10 min-h-[60vh] page__inner">
			<h2 class="text-2xl font-proxima-light uppercase tracking-widest text-gray-400">Coming Soon</h2>
			<p class="text-sm text-gray-400 mt-2">This feature is currently under development.</p>
		</div>
	</div>
</template>
