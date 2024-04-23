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

const { login } = useDirectusAuth();
const route = useRoute();
const loading = ref(false);
const login_error = ref(null);
const emailTouched = ref(false);

const state = reactive({
	email: null,
	password: null,
});

const validate = async (state: any): Promise<FormError[]> => {
	const errors = [];
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
			const response: any = await $fetch(`https://admin.huestudios.company/users?filter[email][_eq]=${state.email}`);

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

async function attemptLogin() {
	loading.value = true;
	login_error.value = null;

	try {
		await login(state.email, state.password);

		if (route.query.redirect) {
			const path = decodeURIComponent(route.query.redirect);
			await navigateTo(path);
		} else {
			await navigateTo('/');
		}
	} catch (err) {
		if (err.data.errors.length) {
			login_error.value = err.data.errors[0].message;
		} else {
			login_error.value = err.message;
		}
	}

	loading.value = false;
}
</script>
