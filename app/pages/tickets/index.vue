<template>
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
</template>

<script setup>
// Layout is chosen by the global `apps-layout.global.ts` middleware — the apps
// shell for apps-mode users, the classic sidebar otherwise. We used to opt out
// with `layout: false` and render our own <NuxtLayout :name>, but that remounted
// the whole shell on every dashboard↔detail navigation, stalling the `out-in`
// page transition and leaving the board blank until a refresh. Letting Nuxt own
// the (persistent) layout fixes the blank-screen bug.
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Tickets | Earnest' });
</script>
