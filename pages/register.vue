<script setup lang="ts">
import { toast } from 'vue-sonner';

definePageMeta({
	layout: 'auth',
	middleware: 'guest',
});

const { register } = useDirectusAuth();
const route = useRoute();

async function handleRegister(values: {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
	organizationName?: string;
}) {
	try {
		await register({
			first_name: values.firstName,
			last_name: values.lastName,
			email: values.email,
			password: values.password,
			organization_name: values.organizationName || undefined,
		});

		toast.success('Account created! Redirecting...');

		const redirectTo = route.query.redirect ? decodeURIComponent(route.query.redirect as string) : '/';
		setTimeout(() => {
			window.location.href = redirectTo;
		}, 1000);
	} catch (err: any) {
		const message = err?.data?.message || err?.message || 'Failed to create account';
		toast.error(message);
	}
}
</script>

<template>
	<div class="w-full max-w-md">
		<AuthRegisterForm
			@submit="handleRegister"
			@login="navigateTo('/auth/signin')"
		/>
	</div>
</template>
