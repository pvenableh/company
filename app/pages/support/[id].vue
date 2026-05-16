<script setup lang="ts">
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Report | Earnest' });

const route = useRoute();
const id = computed(() => String(route.params.id));
</script>

<template>
	<div class="flex flex-col min-h-full">
		<AppHeader title="Report" :show-back="true" back-label="My reports" />
		<LayoutPageContainer>
			<SupportReportDetail :id="id" back-path="/support" />
		</LayoutPageContainer>
	</div>
</template>
