<template>
	<div class="w-full relative">
		<h1 class="page__title">
			Tickets
			<span class="block">Board</span>
		</h1>
		<div class="xl:flex xl:items-center xl:justify-center z-10 w-full page__inner !mt-0 min-h-svh">
			<TicketsBoard />
		</div>
	</div>
</template>

<script setup>
definePageMeta({
	middleware: ['auth'],
});
</script>
