<!--
	/leads/automations — thin deep-link wrapper. The body lives in
	`<AppsClientsLeadAutomationsSurface>` so both this page and the
	`lead-automations` slide-over panel (mounted from `/apps/clients`)
	render the same UI.
-->
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Lead Automations | Earnest' });

// This page uses the default layout (no apps shell), so it must host its own
// slide-over stack for the rule editor panel (lead-automation-rule) to render
// when opened here. Inside /apps/* the layout already mounts one.
useAppSlideOverStackUrlSync();
</script>

<template>
	<LayoutPageContainer>
		<AppsClientsLeadAutomationsSurface />
	</LayoutPageContainer>
	<AppsAppSlideOverStack />
</template>
