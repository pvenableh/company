<script setup>
import { useForm, useField } from 'vee-validate';
import * as yup from 'yup';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CheckCircle, Loader2 } from 'lucide-vue-next';

const { passwordRequest } = useDirectusAuth();
const toast = useToast();
const loading = ref(false);
const resetSent = ref(false);

const schema = yup.object({
	email: yup.string().required('Email is required').email('Must be a valid email'),
});

const { handleSubmit, resetForm } = useForm({
	validationSchema: schema,
	initialValues: {
		email: '',
	},
});

const { value: emailValue, errorMessage: emailErrorMessage } = useField('email');

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
	resetForm();
};
</script>

<template>
	<div class="w-full max-w-md">
		<div v-if="!resetSent">
			<h3 class="text-lg font-medium mb-4">Reset Your Password</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
				Enter your email address below and we'll send you a link to reset your password.
			</p>

			<form class="space-y-4" @submit.prevent="onSubmit">
				<Field>
					<FieldLabel for="reset-email">Email Address</FieldLabel>
					<Input
						id="reset-email"
						v-model="emailValue"
						type="email"
						placeholder="name@example.com"
						autocomplete="email"
					/>
					<FieldError v-if="emailErrorMessage" :errors="[emailErrorMessage]" />
				</Field>

				<Button type="submit" class="w-full" :disabled="loading">
					<Loader2 v-if="loading" class="mr-2 size-4 animate-spin" />
					{{ loading ? 'Sending...' : 'Send Reset Link' }}
				</Button>
			</form>
		</div>

		<div v-else class="text-center py-6">
			<CheckCircle class="mx-auto size-10 text-green-500 mb-4" />
			<h3 class="text-lg font-medium mb-2">Check Your Email</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
				We've sent a password reset link to
				<strong>{{ emailValue }}</strong>
				. Please check your inbox and follow the instructions.
			</p>
			<Button variant="ghost" @click="resetFormState">Try Another Email</Button>
		</div>
	</div>
</template>
