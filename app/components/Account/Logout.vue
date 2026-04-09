<script setup lang="ts">
const { signOut } = useDirectusAuth();
const router = useRouter();

// Function to handle logout when triggered by a user action
const handleLogout = async () => {
	try {
		// Show a loading state if needed
		console.log('Logging out...');

		await signOut({ redirect: false });

		// Navigate to home page
		router.push('/');

		// If navigation doesn't work, fallback to direct URL change
		setTimeout(() => {
			window.location.href = '/';
		}, 500);
	} catch (error) {
		console.error('Logout error:', error);
		window.location.href = '/';
	}
};
</script>

<template>
	<div>
		<!-- Use slot for custom button/trigger -->
		<slot :logout="handleLogout">
			<!-- Default button if no slot content is provided -->
			<a @click.prevent="handleLogout">Logout</a>
		</slot>
	</div>
</template>
