<script setup>
import jwtDecode from 'jwt-decode';

const route = useRoute();

const reset_token = ref(route.query.token ? route.query.token : '');
const decoded = ref('');
const expired = ref(false);
const expiredDate = ref('');

onMounted(() => {
	if (reset_token.value) {
		decoded.value = jwtDecode(reset_token.value);

		expiredDate.value = new Date(decoded.value.exp * 1000);

		if (expiredDate.value >= new Date()) {
			expired.value = true;
		}
	}
});

import { createDirectus, rest, passwordReset } from '@directus/sdk';

const password = ref();

const client = createDirectus('https://admin.1033lenox.com').with(rest());

async function submit() {
	const result = await client.request(passwordReset(reset_token.value, password.value));

	console.log(result);
}
</script>
<template>
	<div class="flex items-center justify-center flex-col min-h-screen">
		<div v-if="expired">
			<h3>Reset password for {{ decoded.email }}.</h3>
			<h5 class="uppercase italic text-xs font-bold">Link expires in {{ getRelativeTime(expiredDate) }}</h5>

			<VForm class="" @submit="submit()" v-if="expired">
				<FormVInput name="password" type="password" rules="required" label="Password" v-model="password" class="my-6" />
				<FormVButton class="w-full mb-6" type="submit">Update Password</FormVButton>
			</VForm>
		</div>
		<h5 v-else class="uppercase italic text-xs font-bold">This link has expired.</h5>
	</div>
</template>

<style></style>
