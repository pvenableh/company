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
definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Tickets | Earnest' });
</script>
