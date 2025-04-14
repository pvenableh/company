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
			v-if="signup_error"
			type="error"
			class="my-4"
			:description="signup_error"
			color="red"
			variant="subtle"
			icon="i-heroicons-exclamation-triangle"
		>
			Error: {{ signup_error }}
		</UAlert>

		<UForm :validate="validate" :state="state" class="grid gap-4" @submit="handleSignup">
			<div class="grid grid-cols-2 gap-4">
				<UFormGroup label="First Name" name="first_name">
					<UInput
						v-model="state.first_name"
						name="first_name"
						size="lg"
						:loading="loading"
						icon="i-heroicons-user"
						placeholder=""
					/>
					<template #error="{ error }">
						<p class="form-error">{{ error }}</p>
					</template>
				</UFormGroup>

				<UFormGroup label="Last Name" name="last_name">
					<UInput
						v-model="state.last_name"
						name="last_name"
						size="lg"
						:loading="loading"
						icon="i-heroicons-user"
						placeholder="Doe"
					/>
					<template #error="{ error }">
						<p class="form-error">{{ error }}</p>
					</template>
				</UFormGroup>
			</div>

			<UFormGroup label="Email" name="email">
				<UInput
					v-model="state.email"
					name="email"
					type="email"
					size="lg"
					:loading="loading"
					icon="i-heroicons-envelope"
					placeholder="name@domain.com"
					@input="emailTouched = true"
				/>
				<template #error="{ error }">
					<p class="form-error">
						{{ error ? error : emailTouched && !error ? 'Your email is valid' : '' }}
					</p>
				</template>
			</UFormGroup>

			<div class="grid grid-cols-2 gap-4">
				<UFormGroup label="Title" name="title">
					<UInput
						v-model="state.title"
						name="title"
						size="lg"
						:loading="loading"
						icon="i-heroicons-briefcase"
						placeholder="Job Title"
					/>
				</UFormGroup>

				<UFormGroup label="Phone" name="phone">
					<UInput
						v-model="state.phone"
						name="phone"
						type="tel"
						size="lg"
						:loading="loading"
						icon="i-heroicons-phone"
						placeholder="(555) 555-5555"
					/>
				</UFormGroup>
			</div>

			<UFormGroup label="Organization" name="organization">
				<USelect
					v-model="state.organization"
					:options="organizations"
					option-attribute="name"
					value-attribute="id"
					searchable
					size="lg"
					:loading="loading"
					placeholder="Select Organization"
				/>
			</UFormGroup>

			<UFormGroup label="Password" name="password">
				<UInput
					v-model="state.password"
					type="password"
					size="lg"
					:loading="loading"
					icon="i-heroicons-lock-closed"
					name="password"
					placeholder="********"
				/>
				<template #hint>
					<span class="text-xs text-gray-500">Password must be at least 6 characters long</span>
				</template>
				<template #error="{ error }">
					<p class="form-error">{{ error }}</p>
				</template>
			</UFormGroup>

			<UFormGroup label="Confirm Password" name="confirm_password">
				<UInput
					v-model="state.confirm_password"
					type="password"
					size="lg"
					:loading="loading"
					icon="i-heroicons-lock-closed"
					name="confirm_password"
					placeholder="********"
				/>
				<template #error="{ error }">
					<p class="form-error">{{ error }}</p>
				</template>
			</UFormGroup>

			<UButton
				type="submit"
				:loading="loading"
				:disabled="!isFormValid"
				size="lg"
				label="Sign Up"
				trailing-icon="i-heroicons-arrow-right"
				block
			/>
		</UForm>
	</div>
</template>

<script setup lang="ts">
import type { FormError } from '#ui/types';

interface SignupState {
	first_name: string;
	last_name: string;
	email: string;
	password: string;
	confirm_password: string;
	phone: string;
	title: string;
	organization: string;
}

interface Organization {
	id: string;
	name: string;
}

const { createUser } = useDirectusUsers();
const { login } = useAuthActions();
const { readItems, createItem } = useDirectusItems();
const route = useRoute();
const loading = ref<boolean>(false);
const signup_error = ref<string | null>(null);
const emailTouched = ref<boolean>(false);
const organizations = ref<Organization[]>([]);

const state = reactive<SignupState>({
	first_name: '',
	last_name: '',
	email: '',
	password: '',
	confirm_password: '',
	phone: '',
	title: '',
	organization: '',
});

// Fetch organizations when component mounts
onMounted(async () => {
	try {
		organizations.value = await readItems('organizations' as any, {
			fields: ['id', 'name'],
			sort: ['name'],
		});
	} catch (error) {
		console.error('Failed to fetch organizations:', error);
	}
});

const isFormValid = computed(() => {
	return (
		state.first_name &&
		state.last_name &&
		state.email &&
		state.password &&
		state.confirm_password &&
		state.password === state.confirm_password &&
		state.password.length >= 6 &&
		state.organization
	);
});

const validate = async (state: SignupState): Promise<FormError[]> => {
	const errors: FormError[] = [];
	const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;

	// Required fields validation
	if (!state.first_name) errors.push({ path: 'first_name', message: 'First name is required' });
	if (!state.last_name) errors.push({ path: 'last_name', message: 'Last name is required' });
	if (!state.organization) errors.push({ path: 'organization', message: 'Organization is required' });

	// Email validation
	if (!state.email) {
		errors.push({ path: 'email', message: 'Email is required' });
	} else if (!emailRegex.test(state.email)) {
		errors.push({ path: 'email', message: 'Please enter a valid email address' });
	} else {
		try {
			// Check if email already exists
			const response = await $fetch<{ data: any[] }>(
				`${useRuntimeConfig().public.directusUrl}/users?filter[email][_eq]=${state.email}`,
			);
			if (response.data.length > 0) {
				errors.push({ path: 'email', message: 'This email is already registered' });
			}
		} catch (error) {
			console.error('Error checking email:', error);
		}
	}

	// Password validation
	if (!state.password) {
		errors.push({ path: 'password', message: 'Password is required' });
	} else if (state.password.length < 6) {
		errors.push({ path: 'password', message: 'Password must be at least 6 characters long' });
	}

	// Confirm password validation
	if (!state.confirm_password) {
		errors.push({ path: 'confirm_password', message: 'Please confirm your password' });
	} else if (state.password !== state.confirm_password) {
		errors.push({ path: 'confirm_password', message: 'Passwords do not match' });
	}

	return errors;
};

const handleSignup = async () => {
	loading.value = true;
	signup_error.value = null;

	try {
		// Create the user
		const user = await createUser({
			first_name: state.first_name,
			last_name: state.last_name,
			email: state.email,
			password: state.password,
			title: state.title,
			phone: state.phone,
			role: 'cdadd1fd-280e-4d4a-83e6-1b911889af46',
		});

		// Create organization relationship
		if (user?.id) {
			await createItem('organizations_directus_users', {
				organizations_id: state.organization,
				directus_users_id: user.id,
			});
		}

		// Log in the user
		await login(state.email, state.password);

		// Redirect
		if (route.query.redirect) {
			const path = decodeURIComponent(route.query.redirect as string);
			await navigateTo(path);
		} else {
			await navigateTo('/');
		}
	} catch (error: any) {
		signup_error.value = error.message || 'Failed to create account';
	} finally {
		loading.value = false;
	}
};
</script>
<style>
/* Error message styling */
.error-message {
	@apply text-xs uppercase tracking-wide font-medium;
	color: var(--red);
}

/* Success message styling */
.success-message {
	@apply text-xs uppercase tracking-wide font-medium;
	color: var(--green);
}
.form-error {
	@apply text-xs font-medium uppercase tracking-wide mt-1 absolute right-0;
	color: var(--red);
	animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
	from {
		opacity: 0;
		transform: translateY(-5px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
</style>
