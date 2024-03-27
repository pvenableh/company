<template>
	<a class="cursor-pointer" @click.prevent="handleLogout">Logout</a>
	<a class="cursor-pointer" @click.prevent="logout">Logout 2</a>
</template>
<script setup>
const { logout } = useDirectusAuth();
const cookie = useCookie('directus_refresh_token');

const handleLogout = async () => {
	try {
		console.log('Peter');
		const result = await logout();
		console.log(result);
	} catch (error) {
		console.error(error);
	}
	// await logout();
	// return await navigateTo('/', { replace: true });
};

// import { createDirectus, authentication, rest, logout } from '@directus/sdk';

// const client = createDirectus('https://admin.huestudios.company').with(authentication()).with(rest());
// const handleLogout2 = async () => {
// 	// logout using the authentication composable
// 	// const result = await client.logout();

// 	// // logout http request
// 	console.log(cookie.value);
// 	const result = await client.request(logout(cookie.value));
// 	console.log(result);
// };
</script>
<style></style>
