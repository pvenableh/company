<template>
	<a class="cursor-pointer" @click.prevent="handleLogout">Logout</a>
</template>
<script setup>
const { signOut: logout } = useAuth();

const handleLogout = async () => {
	try {
		await logout();
		// Clear any stored tokens/state

		// Force page reload and redirect
		window.location.href = '/';
	} catch (error) {
		console.error('Logout error:', error);
	}
};
</script>
<style></style>
