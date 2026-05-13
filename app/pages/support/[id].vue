<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Report | Earnest' });

const route = useRoute();
const id = computed(() => String(route.params.id));
</script>

<template>
	<LayoutPageContainer>
		<SupportReportDetail :id="id" back-path="/support" />
	</LayoutPageContainer>
</template>
