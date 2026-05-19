<template>
	<NuxtLayout :name="layout">
	<LayoutPageContainer>
		<LayoutPageHeader title="Tickets" subtitle="Board">
			<template #actions>
				<LayoutShareButton title="Tickets | Earnest" />
			</template>
		</LayoutPageHeader>

		<div class="xl:flex xl:items-center xl:justify-center w-full min-h-svh">
			<TicketsBoard />
		</div>
	</LayoutPageContainer>
	</NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Tickets | Earnest' });

// Apps-mode users get the apps shell so the board isn't orphaned from
// the AppRail. Classic mode keeps the original sidebar.
const { isAppsMode } = useAppsMode();
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'));
</script>
