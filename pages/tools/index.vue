<template>
	<div class="container mx-auto py-12">
		<h1 class="text-3xl font-bold mb-8">Admin Tools</h1>

		<div v-if="isAdmin">
			<p class="text-gray-500">No tools available.</p>
		</div>
		<div v-else>
			<UAlert title="Access Denied" description="You don't have permission to access this page." color="red" />
		</div>
	</div>
</template>

<script setup>
const { canAccess } = useRole();

const isAdmin = computed(() => {
	return canAccess('org_settings');
});
</script>
