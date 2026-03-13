<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});
</script>

<template>
	<div class="page__content">
		<h1 class="page__title">
			Financials
			<span class="block">Quarterly Analysis</span>
		</h1>
		<div class="max-w-4xl mx-auto px-4 2xl:px-0 page__inner">
			<CommandCenterFinancialQuarter />
		</div>
	</div>
</template>
