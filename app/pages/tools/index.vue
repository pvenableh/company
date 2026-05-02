<template>
	<LayoutPageContainer>
		<h1 class="text-xl font-semibold text-foreground mb-6">Admin Tools</h1>

		<div v-if="isAdmin">
			<p class="text-gray-500">No tools available.</p>
		</div>
		<div v-else>
			<UAlert title="Access Denied" description="You don't have permission to access this page." color="red" />
		</div>
	</LayoutPageContainer>
</template>

<script setup>
useHead({ title: 'Admin Tools | Earnest' });

const { canAccess } = useOrgRole();

const isAdmin = computed(() => {
	return canAccess('org_settings');
});
</script>
