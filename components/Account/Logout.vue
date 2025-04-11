<script setup lang="ts">
const { signOut } = useAuth();

// On page load, trigger logout and redirect to home
onMounted(async () => {
	try {
		await signOut({ redirect: true, callbackUrl: '/' });
		// If the above doesn't redirect, force reload
		setTimeout(() => {
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
