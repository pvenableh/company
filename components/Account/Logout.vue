<template>
	<a class="cursor-pointer" @click.prevent="handleLogout">Logouts</a>
</template>
<script setup>
// const { logout } = useDirectusAuth();

// const onSubmit = async () => {
// 	await logout();
// 	return await navigateTo('/', { replace: true });
// };
const cookie = useCookie('directus_refresh_token');
const { logout } = useDirectusAuth();

const handleLogout = async () => {
	console.log(cookie.value);
	await logout(cookie.value);
};
</script>
<style></style>
