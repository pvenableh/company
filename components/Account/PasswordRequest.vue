<template>
	<div class="w-full flex items-start justify-start flex-row password-request">
		<form class="w-full" @submit.prevent="submit">
			<UInput name="email" type="email" label="Email" v-model="email" class="my-6" />

			<UButton class="w-full mb-6" type="submit">Send Email</UButton>
		</form>
	</div>
</template>

<script setup lang="ts">
const { passwordRequest } = useDirectusAuth();
const toast = useToast();

const email = ref('peter@huestudios.com');

async function submit() {
	openScreen();
	await passwordRequest(email.value, 'http://localhost:3000/auth/password-reset');
	closeScreen();
	toast.add({ title: 'An email was sent to ' + email.value + '.' });
}
</script>
<style></style>
