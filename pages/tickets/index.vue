<template>
	<div class="w-full relative">
		<h1 class="page__title">
			Tickets
			<span class="block">Board</span>
		</h1>
		<div class="xl:flex xl:items-center xl:justify-center z-10 overflow-x-auto page__inner">
			<TicketsBoard />
		</div>
	</div>
</template>

<script setup>
definePageMeta({
	middleware: ['auth'],
});
</script>
