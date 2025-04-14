<script setup>
import { useForm } from 'vee-validate';
import * as yup from 'yup';

const { passwordRequest } = useAuthActions();
const toast = useToast();
const loading = ref(false);
const resetSent = ref(false);

const schema = yup.object({
	email: yup.string().required('Email is required').email('Must be a valid email'),
});

const { handleSubmit, resetForm, errors, values } = useForm({
	validationSchema: schema,
	initialValues: {
		email: '',
	},
});

const onSubmit = handleSubmit(async (formValues) => {
	loading.value = true;
	try {
		await passwordRequest(formValues.email);
		resetSent.value = true;
		toast.add({
			title: 'Reset Email Sent',
			description: 'Check your email for the password reset link',
			color: 'green',
		});
	} catch (error) {
		toast.add({
			title: 'Error',
			description: error.message || 'Failed to send reset email',
			color: 'red',
		});
	} finally {
		loading.value = false;
	}
});

const resetFormState = () => {
	resetSent.value = false;
};
</script>

<template>
	<div class="w-full max-w-md">
		<div v-if="!resetSent">
			<h3 class="text-lg font-medium mb-4">Reset Your Password</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
				Enter your email address below and we'll send you a link to reset your password.
			</p>

			<form @submit.prevent="onSubmit" class="space-y-4">
				<UFormGroup label="Email Address" :error="errors.email">
					<UInput
						v-model="values.email"
						type="email"
						placeholder="name@example.com"
						autocomplete="email"
						icon="i-heroicons-envelope"
					/>
				</UFormGroup>

				<UButton type="submit" :loading="loading" block label="Send Reset Link" />
			</form>
		</div>

		<div v-else class="text-center py-6">
			<UIcon name="i-heroicons-check-circle" class="text-4xl text-green-500 mb-4" />
			<h3 class="text-lg font-medium mb-2">Check Your Email</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
				We've sent a password reset link to
				<strong>{{ values.email }}</strong>
				. Please check your inbox and follow the instructions.
			</p>
			<UButton @click="resetFormState" variant="ghost" label="Try Another Email" />
		</div>
	</div>
</template>
