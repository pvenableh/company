<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Financial Insights | Earnest' });
</script>

<template>
	<div class="page__content">
		<div class="max-w-4xl mx-auto px-4 2xl:px-0 page__inner">
			<CommandCenterFinancialQuarter />
		</div>
	</div>
</template>
