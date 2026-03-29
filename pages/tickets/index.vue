<template>
	<div class="page__content">
		<div class="max-w-screen-xl mx-auto page_inner px-4 2xl:px-0">
			<!-- Header -->
			<div class="flex items-center justify-between mb-6">
				<div>
					<h1 class="text-xl font-semibold">Tickets</h1>
					<p class="text-sm text-muted-foreground">Board</p>
				</div>
				<LayoutShareButton title="Tickets | Earnest" />
			</div>
		</div>

		<div class="max-w-screen-xl mx-auto px-4 2xl:px-0">
			<div class="xl:flex xl:items-center xl:justify-center w-full min-h-svh">
				<TicketsBoard />
			</div>
		</div>
	</div>
</template>

<script setup>
definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Tickets | Earnest' });
</script>
