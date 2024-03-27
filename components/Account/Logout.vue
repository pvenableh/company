<template>
	<a class="cursor-pointer" @click.prevent="handleLogout">Logout</a>
</template>
<script setup>
// const { logout } = useDirectusAuth();
const cookie = useCookie('directus_refresh_token');

// const handleLogout = async () => {
// 	await logout(cookie.value);
// 	return await navigateTo('/', { replace: true });
// };

import { createDirectus, authentication, rest, logout } from '@directus/sdk';

const client = createDirectus('https://admin.huestudios.company').with(authentication()).with(rest());
const handleLogout = async () => {
	// logout using the authentication composable
	// const result = await client.logout();

	// // logout http request
	console.log(cookie.value);
	const result = await client.request(logout(cookie.value));
};
</script>
<style></style>
