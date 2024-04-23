<template>
	<a class="cursor-pointer" @click.prevent="handleLogout">Logout</a>
</template>
<script setup>
const { logout } = useDirectusAuth();

const handleLogout = async () => {
	try {
		const result = await logout();
		return await navigateTo('/', { replace: true });
	} catch (error) {
		console.error(error);
	}
};
</script>
<style></style>
