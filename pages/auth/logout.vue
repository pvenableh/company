<script setup lang="ts">
const { signOut } = useEnhancedAuth();
const route = useRoute();

// Add logging to understand when and why this component is mounted
onMounted(async () => {
	console.log('Logout component mounted', {
		path: route.path,
		fullPath: route.fullPath,
		query: route.query,
	});

	try {
		await signOut();
		console.log('Signout completed, redirecting to home');

		// If the above doesn't redirect, force reload
		setTimeout(() => {
			console.log('Timeout reached, forcing redirect');
			window.location.href = '/';
		}, 500);
	} catch (error) {
		console.error('Logout error:', error);
		window.location.href = '/';
	}
});
</script>

<template>
	<div class="flex items-center justify-center h-screen">
		<UCard>
			<template #header>
				<div class="text-center">
					<h3 class="text-lg font-medium">Logging out...</h3>
				</div>
			</template>
			<div class="flex justify-center">
				<UButton to="/" label="Return to Home" variant="ghost" />
			</div>
		</UCard>
	</div>
</template>
