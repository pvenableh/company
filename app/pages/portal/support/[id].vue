<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Report | Client Portal' });

const route = useRoute();
const id = computed(() => String(route.params.id));
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Report" />

		<LayoutPageContainer>
			<SupportReportDetail :id="id" back-path="/portal/support" />
		</LayoutPageContainer>
	</div>
</template>
