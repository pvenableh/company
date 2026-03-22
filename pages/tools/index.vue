<template>
	<div class="container mx-auto py-12">
		<h1 class="text-xl font-semibold text-foreground">Admin Tools</h1>

		<div v-if="isAdmin">
			<p class="text-gray-500">No tools available.</p>
		</div>
		<div v-else>
			<UAlert title="Access Denied" description="You don't have permission to access this page." color="red" />
		</div>
	</div>
</template>

<script setup>
useHead({ title: 'Admin Tools | Earnest' });

const { canAccess } = useOrgRole();

const isAdmin = computed(() => {
	return canAccess('org_settings');
});
</script>
