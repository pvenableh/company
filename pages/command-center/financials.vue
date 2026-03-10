<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<div class="max-w-4xl mx-auto px-4 py-8">
		<div class="flex items-center gap-3 mb-8">
			<NuxtLink to="/command-center" class="text-gray-400 hover:text-gray-600 transition-colors">
				<UIcon name="i-heroicons-arrow-left" class="w-5 h-5" />
			</NuxtLink>
			<h1 class="text-2xl font-bold">Financial Analysis</h1>
		</div>
		<CommandCenterFinancialQuarter />
	</div>
</template>
