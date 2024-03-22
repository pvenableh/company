<template>
	<a class="cursor-pointer" @click.prevent="handleLogout">Logout</a>
</template>
<script setup>
const { logout } = useDirectusAuth();
const cookie = useCookie('directus_refresh_token');

const handleLogout = async () => {
	await logout(cookie.value);
	return await navigateTo('/', { replace: true });
};
</script>
<style></style>
