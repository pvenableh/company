<template>
	<div
		v-motion="{
			initial: {
				y: -100,
				opacity: 0,
			},
			enter: {
				y: 0,
				opacity: 1,
			},
		}"
		class="w-full"
	>
		<UAlert
			v-if="login_error"
			type="error"
			class="my-4"
			:description="login_error"
			color="red"
			variant="subtle"
			icon="i-heroicons-exclamation-triangle"
		>
			Error: {{ login_error }}
		</UAlert>

		<UForm :validate="validate" :state="state" class="grid gap-4" @submit="attemptLogin">
			<UFormGroup label="Email" name="email">
				<UInput
					v-model="state.email"
					name="email"
					label="Email"
					type="email"
					size="lg"
					:loading="loading"
					icon="i-heroicons-envelope"
					placeholder="name@domain.com"
					@input="emailTouched = true"
				/>
				<template #error="{ error }">
					<span
						class="uppercase tracking-wide text-xs"
						:class="[error ? 'text-red-500 dark:text-red-400' : 'text-primary-500 dark:text-primary-400']"
					>
						{{ error ? error : emailTouched && !error ? 'Your email is valid' : '' }}
					</span>
				</template>
			</UFormGroup>
			<UFormGroup label="Password" required>
				<UInput
					v-model="state.password"
					type="password"
					size="lg"
					:loading="loading"
					icon="i-heroicons-lock-closed"
					name="password"
					label="Password"
					placeholder="********"
				/>
			</UFormGroup>
			<UButton
				type="submit"
				:loading="loading"
				:disabled="!state.email"
				size="lg"
				label="Sign In"
				trailing-icon="i-heroicons-arrow-right"
				block
			/>
		</UForm>
	</div>
</template>

<script setup lang="ts">
import type { FormError } from '#ui/types';

interface LoginState {
	email: string;
	password: string;
}

interface ApiResponse {
	data: Array<Record<string, unknown>>;
}

interface LoginError {
	error?: string;
	message?: string;
	data?: {
		errors?: Array<{
			message?: string;
		}>;
	};
}
const { signIn } = useAuth();
const route = useRoute();
const loading = ref<boolean>(false);
const login_error = ref<string | null>(null);
const emailTouched = ref<boolean>(false);
const config = useRuntimeConfig();

const state = reactive<LoginState>({
	email: '',
	password: '',
});

const validate = async (state: LoginState): Promise<FormError[]> => {
	const errors: FormError[] = [];
	const regex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;

	if (!state.email) {
		errors.push({ path: 'email', message: 'Required' });
	}

	if (!regex.test(state.email)) {
		errors.push({ path: 'email', message: 'This must be a valid email' });
	}

	if (state.email && regex.test(state.email)) {
		try {
			loading.value = true;
			const response = await $fetch<ApiResponse>(
				`${config.public.directusUrl}/users?filter[email][_eq]=${state.email}`,
			);

			if (response.data.length < 1) {
				errors.push({ path: 'email', message: 'This email is not registered.' });
			}

			loading.value = false;
		} catch (error) {
			errors.push({ path: 'email', message: 'Failed to validate email' });
			loading.value = false;
		}
	}

	return errors;
};

async function attemptLogin(): Promise<void> {
	loading.value = true;
	login_error.value = null;

	try {
		// Get redirect URL from query params or default to homepage
		const redirectTo = route.query.redirect ? decodeURIComponent(route.query.redirect as string) : '/';

		// Use signIn with redirect: true to let NextAuth handle the redirect automatically
		const result = await signIn('credentials', {
			email: state.email,
			password: state.password,
			redirect: false,
		});

		// The code below will not execute if redirect is true
		// Keeping as fallback in case redirect doesn't work
		if (result?.error) {
			login_error.value = result.error;
			loading.value = false;
			return;
		}

		// If we somehow get here despite redirect:true, try navigating manually
		window.location.href = redirectTo;
	} catch (err) {
		const error = err as LoginError;
		login_error.value =
			error.error || error.message || error.data?.errors?.[0]?.message || 'An unexpected error occurred';
		loading.value = false;
	}
}
</script>
