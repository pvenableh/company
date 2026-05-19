<script setup>
definePageMeta({
	layout: 'auth',
});

import { useForm, useField } from 'vee-validate';
import * as yup from 'yup';
import { openScreen, closeScreen } from '~/composables/useScreen';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-vue-next';

// Earnest-branded reset flow (replaces Directus's JWT-token passwordReset).
// The token is a 64-char hex blob — server-validated on submit. No client-
// side decode; if the token is invalid/expired/used, the server returns an
// error and we toast it.
const route = useRoute();

const reset_token = ref(route.query.token ? String(route.query.token) : '');
const missingToken = computed(() => !reset_token.value);
const toast = useToast();
const showPassword = ref(false);

const schema = yup.object({
	password: yup
		.string()
		.required('Password is required')
		.min(6, 'Password must be at least 6 characters')
		.matches(/[a-z]/, 'Password must contain at least one lowercase letter')
		.matches(/[0-9]/, 'Password must contain at least one number'),
});

const { handleSubmit } = useForm({
	validationSchema: schema,
});

const { value: password, errorMessage } = useField('password', schema.fields.password);

const onSubmit = handleSubmit(async (values) => {
	if (missingToken.value) return;
	try {
		openScreen();
		await $fetch('/api/directus/users/password-reset', {
			method: 'POST',
			body: { token: reset_token.value, password: values.password },
		});
		toast.add({
			title: 'Password reset',
			description: 'You can now sign in with your new password.',
			color: 'green',
		});
		setTimeout(() => {
			closeScreen();
			navigateTo('/auth/signin');
		}, 1500);
	} catch (error) {
		closeScreen();
		// $fetch surfaces server-error messages on `error.data?.message`.
		const description =
			error?.data?.message ||
			error?.statusMessage ||
			error?.message ||
			'Failed to reset password';
		toast.add({
			title: 'Reset failed',
			description,
			color: 'red',
		});
	}
});

const togglePassword = () => {
	showPassword.value = !showPassword.value;
};
</script>

<template>
	<div class="w-full max-w-sm">
		<div v-if="missingToken">
			<h3 class="text-lg font-semibold">Missing reset link</h3>
			<p class="text-sm text-muted-foreground mt-2">
				This page needs a token from your password-reset email. If the link
				didn't load, request a new one from the sign-in page.
			</p>
			<NuxtLink to="/auth/signin" class="inline-block mt-4 text-sm text-primary hover:underline">
				← Back to sign in
			</NuxtLink>
		</div>

		<div v-else>
			<h3 class="text-lg font-semibold">Reset your password</h3>
			<p class="text-sm text-muted-foreground mt-1 mb-6">
				Pick a new password for your Earnest account. The link expires one hour after it was sent.
			</p>
			<form @submit.prevent="onSubmit">
				<Field>
					<FieldLabel for="reset-password">New password <span class="text-destructive">*</span></FieldLabel>
					<div class="relative">
						<Input
							id="reset-password"
							v-model="password"
							name="password"
							:type="showPassword ? 'text' : 'password'"
							placeholder="Enter new password"
							class="pr-10"
						/>
						<button
							type="button"
							class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							@click="togglePassword"
						>
							<EyeOff v-if="showPassword" class="size-4" />
							<Eye v-else class="size-4" />
						</button>
					</div>
					<FieldError v-if="errorMessage" :errors="[errorMessage]" />
				</Field>
				<Button type="submit" class="w-full my-6">Reset password</Button>
			</form>
		</div>
	</div>
</template>
