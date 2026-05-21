<!--
	/leads/automations — thin deep-link wrapper. The body lives in
	`<AppsClientsLeadAutomationsSurface>` so both this page and the
	`lead-automations` slide-over panel (mounted from `/apps/clients`)
	render the same UI.
-->
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Lead Automations | Earnest' });
</script>

<template>
	<LayoutPageContainer>
		<AppsClientsLeadAutomationsSurface />
	</LayoutPageContainer>
</template>
