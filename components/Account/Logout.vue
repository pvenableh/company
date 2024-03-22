<template>
	<a class="cursor-pointer" @click.prevent="submit">Logouts</a>
</template>
<script setup>
import { createDirectus, rest, logout } from '@directus/sdk';
const cookie = useCookie('directus_refresh_token');

const password = ref();
const client = createDirectus('https://admin.huestudios.company').with(rest());

async function submit() {
	// const result = await client.request(logout());
	const result = await client.request(logout({ refresh_token: cookie.value }));
	console.log(result);
}
// const { logout } = useDirectusAuth();

// const onSubmit = async () => {
// 	await logout();
// 	return await navigateTo('/', { replace: true });
// };
// const cookie = useCookie('directus_refresh_token');
// const { logout } = useDirectusAuth();

// const handleLogout = async () => {
// 	console.log(cookie.value);
// 	await logout(cookie.value);
// };
</script>
<style></style>
