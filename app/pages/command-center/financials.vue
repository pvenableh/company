<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Financial Insights | Earnest' });
</script>

<template>
	<LayoutPageContainer>
		<CommandCenterFinancialQuarter />
	</LayoutPageContainer>
</template>
