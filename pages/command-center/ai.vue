<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<div class="max-w-6xl mx-auto px-4 pt-16 pb-8 sm:px-6 lg:px-8">
		<div class="flex items-center gap-3 mb-6">
			<NuxtLink to="/" class="text-muted-foreground hover:text-foreground transition-colors">
				<UIcon name="i-heroicons-arrow-left" class="w-5 h-5" />
			</NuxtLink>
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary" />
				<h1 class="text-2xl font-bold">AI Assistant</h1>
			</div>
		</div>
		<div class="h-[calc(100vh-180px)]">
			<CommandCenterAIChat />
		</div>
	</div>
</template>
