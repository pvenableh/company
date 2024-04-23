<template>
	<div class="w-full flex items-start justify-start flex-row password-request">
		<UForm :validate="validate" :state="state" class="w-full" @submit="submit">
			<UFormGroup label="Email" name="email" class="my-6">
				<UInput
					v-model="state.email"
					name="email"
					type="email"
					label="Email"
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
			<UButton
				class="w-full mb-6"
				type="submit"
				size="lg"
				label="Send Email"
				trailing-icon="i-heroicons-arrow-right"
				block
			></UButton>
		</UForm>
	</div>
</template>

<script setup lang="ts">
import type { FormError } from '#ui/types';

const { passwordRequest } = useDirectusAuth();
const toast = useToast();
const loading = ref(false);
const emailTouched = ref(false);

const state = reactive({
	email: 'peter@huestudios.com',
});

const validate = async (state: any): Promise<FormError[]> => {
	const errors = [];

	if (!state.email) {
		errors.push({ path: 'email', message: 'Required' });
	}

	const regex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;

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

function submit() {
	openScreen();
	passwordRequest(state.email, 'https://huestudios.company/auth/password-reset');
	closeScreen();
	toast.add({ title: 'An email was sent to ' + state.email + '.' });
}
</script>
<style></style>
