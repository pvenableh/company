<template>
	<div class="p-4 md:p-6 mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-semibold">Tickets</h1>
				<p class="text-sm text-muted-foreground">Board</p>
			</div>
		</div>

		<div class="xl:flex xl:items-center xl:justify-center w-full min-h-svh">
			<TicketsBoard />
		</div>
	</div>
</template>

<script setup>
definePageMeta({
	middleware: ['auth'],
});
</script>
