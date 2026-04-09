<script setup lang="ts">
import { toast } from 'vue-sonner';

definePageMeta({
	layout: 'auth',
	middleware: 'guest',
});

const { signIn, passwordRequest } = useDirectusAuth();
const route = useRoute();
const loginFormRef = ref<InstanceType<typeof AuthLoginForm> | null>(null);
const isLoading = ref(false);
const panel = ref<'login' | 'forgot-password'>('login');

async function handleLogin(values: { email: string; password: string }) {
	isLoading.value = true;
	try {
		const redirectTo = route.query.redirect ? decodeURIComponent(route.query.redirect as string) : '/';
		await signIn({ email: values.email, password: values.password });
		window.location.href = redirectTo;
	} catch (err: any) {
		const message = err?.data?.message || err?.message || 'Invalid email or password';
		loginFormRef.value?.setFormError(message);
		isLoading.value = false;
	}
}

async function handleForgotPassword(values: { email: string }) {
	try {
		await passwordRequest(values.email);
		toast.success('If an account exists with that email, a reset link has been sent.');
	} catch {
		// Don't reveal whether email exists
		toast.success('If an account exists with that email, a reset link has been sent.');
	}
}
</script>

<template>
	<div class="w-full max-w-sm">
		<Transition
			enter-active-class="transition-all duration-300 ease-out"
			leave-active-class="transition-all duration-200 ease-in"
			enter-from-class="opacity-0 translate-y-2"
			enter-to-class="opacity-100 translate-y-0"
			leave-from-class="opacity-100 translate-y-0"
			leave-to-class="opacity-0 -translate-y-2"
			mode="out-in"
		>
			<AuthLoginForm
				v-if="panel === 'login'"
				ref="loginFormRef"
				:is-loading="isLoading"
				@submit="handleLogin"
				@forgot-password="panel = 'forgot-password'"
				@register="navigateTo('/register')"
			/>
			<AuthPasswordResetRequestForm
				v-else
				@submit="handleForgotPassword"
				@back="panel = 'login'"
			/>
		</Transition>
	</div>
</template>
