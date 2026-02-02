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
		<Alert
			v-if="login_error"
			variant="destructive"
			class="my-4"
		>
			<AlertTriangle class="size-4" />
			<AlertDescription>{{ login_error }}</AlertDescription>
		</Alert>

		<form class="grid gap-4" @submit.prevent="attemptLogin">
			<Field>
				<FieldLabel for="login-email">Email</FieldLabel>
				<Input
					id="login-email"
					v-model="state.email"
					name="email"
					type="email"
					placeholder="name@domain.com"
					@input="emailTouched = true"
				/>
				<FieldError v-if="emailError" :errors="[emailError]" />
				<FieldDescription
					v-else-if="emailTouched && !emailError && state.email"
					class="text-primary text-xs uppercase tracking-wide"
				>
					Your email is valid
				</FieldDescription>
			</Field>

			<Field>
				<FieldLabel for="login-password">Password <span class="text-destructive">*</span></FieldLabel>
				<Input
					id="login-password"
					v-model="state.password"
					type="password"
					name="password"
					placeholder="********"
				/>
			</Field>

			<Button
				type="submit"
				class="w-full"
				:disabled="loading || !state.email"
			>
				<Loader2 v-if="loading" class="mr-2 size-4 animate-spin" />
				{{ loading ? 'Signing in...' : 'Sign In' }}
			</Button>
		</form>
	</div>
</template>

<script setup lang="ts">
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Loader2 } from 'lucide-vue-next';

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

const { signIn } = useEnhancedAuth();
const route = useRoute();
const loading = ref<boolean>(false);
const login_error = ref<string | null>(null);
const emailTouched = ref<boolean>(false);
const emailError = ref<string | null>(null);
const config = useRuntimeConfig();

const state = reactive<LoginState>({
	email: '',
	password: '',
});

async function validateEmail(): Promise<boolean> {
	const regex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;
	emailError.value = null;

	if (!state.email) {
		emailError.value = 'Required';
		return false;
	}

	if (!regex.test(state.email)) {
		emailError.value = 'This must be a valid email';
		return false;
	}

	try {
		loading.value = true;
		const response = await $fetch<ApiResponse>(
			`${config.public.directusUrl}/users?filter[email][_eq]=${state.email}`,
		);

		if (response.data.length < 1) {
			emailError.value = 'This email is not registered.';
			loading.value = false;
			return false;
		}

		loading.value = false;
		return true;
	} catch {
		emailError.value = 'Failed to validate email';
		loading.value = false;
		return false;
	}
}

async function attemptLogin(): Promise<void> {
	loading.value = true;
	login_error.value = null;

	const valid = await validateEmail();
	if (!valid) {
		loading.value = false;
		return;
	}

	try {
		const redirectTo = route.query.redirect ? decodeURIComponent(route.query.redirect as string) : '/';

		const result = await signIn({
			email: state.email,
			password: state.password,
			redirect: false,
		});

		if (result?.error) {
			login_error.value = result.error;
			loading.value = false;
			return;
		}

		window.location.href = redirectTo;
	} catch (err) {
		const error = err as LoginError;
		login_error.value =
			error.error || error.message || error.data?.errors?.[0]?.message || 'An unexpected error occurred';
		loading.value = false;
	}
}
</script>
