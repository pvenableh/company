<script setup>
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

const { user: directusUser } = useDirectusAuth();
const { hasAdminAccess } = useTeams();

const isAdmin = computed(() => hasAdminAccess(directusUser.value));

definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<div class="page__content">
		<h1 class="page__title">
			Projects
			<span class="block">Board</span>
		</h1>
		<div v-if="isAdmin" class="xl:flex xl:items-center xl:justify-center z-10 min-h-svh overflow-x-auto page__inner">
			<ProjectsBoard />
		</div>
		<div v-else class="flex flex-col items-center justify-center z-10 min-h-[60vh] page__inner">
			<h2 class="text-2xl font-proxima-light uppercase tracking-widest text-gray-400">Coming Soon</h2>
			<p class="text-sm text-gray-400 mt-2">This feature is currently under development.</p>
		</div>
	</div>
</template>
