<template>
	<a class="cursor-pointer" @click.prevent="handleLogout">Logout</a>
</template>
<script setup>
const { logout } = useDirectusAuth();

const handleLogout = async () => {
	try {
		await logout();
		// Clear any stored tokens/state
		localStorage.removeItem('auth_token');
		localStorage.removeItem('auth_expires');
		// Force page reload and redirect
		window.location.href = '/';
	} catch (error) {
		console.error('Logout error:', error);
	}
};
</script>
<style></style>
