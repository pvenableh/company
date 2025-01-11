<script setup>
import { jwtDecode } from 'jwt-decode';
import { useForm, useField } from 'vee-validate';
import * as yup from 'yup';
import { openScreen, closeScreen } from '~/composables/useScreen';

const { passwordReset } = useDirectusAuth();
const route = useRoute();

const reset_token = ref(route.query.token ? route.query.token : '');
const decoded = ref('');
const expired = ref(false);
const expiredDate = ref('');
const loading = ref(true);
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

// Use useField for password
const { value: password, errorMessage } = useField('password', schema.fields.password);

onMounted(() => {
	if (reset_token.value) {
		decoded.value = jwtDecode(reset_token.value);
		expiredDate.value = new Date(decoded.value.exp * 1000);
		if (expiredDate.value >= new Date()) {
			expired.value = true;
		}
		loading.value = false;
	} else {
		loading.value = false;
	}
});

const onSubmit = handleSubmit(async (values) => {
	try {
		openScreen();
		await passwordReset(reset_token.value, values.password);
		toast.add({
			title: 'Success',
			description: 'Password reset successfully. Routing to login page.',
			color: 'green',
		});
		setTimeout(() => {
			closeScreen();
			navigateTo('/auth/signin');
		}, 2000);
	} catch (error) {
		closeScreen();
		toast.add({
			title: 'Error',
			description: error.message || 'Failed to reset password',
			color: 'red',
		});
	}
});

const togglePassword = () => {
	showPassword.value = !showPassword.value;
};
</script>

<template>
	<div class="flex items-center justify-center flex-col min-h-[90svh]">
		<transition name="fade" mode="out-in">
			<div v-if="expired">
				<h3>Reset password for {{ decoded.email }}.</h3>
				<h5 class="uppercase italic text-xs font-bold mt-2 mb-6">Link expires in {{ getRelativeTime(expiredDate) }}</h5>
				<form @submit.prevent="onSubmit">
					<UFormGroup label="Password" required :error="errorMessage">
						<div class="relative">
							<UInput
								v-model="password"
								name="password"
								:type="showPassword ? 'text' : 'password'"
								placeholder="Enter new password"
								class=""
								:ui="{
									icon: { trailing: { pointer: 'cursor-pointer' } },
								}"
							>
								<template #trailing>
									<UButton
										:icon="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
										color="gray"
										variant="ghost"
										@click="togglePassword"
										:padded="false"
									/>
								</template>
							</UInput>
						</div>
						<template #error>
							<p class="text-xs text-red-500 text-right uppercase font-bold">{{ errorMessage }}</p>
						</template>
					</UFormGroup>
					<UButton type="submit" class="w-full my-6 text-center" label="Reset Password" />
				</form>
			</div>

			<h5 v-else-if="expired" class="uppercase italic text-xs font-bold">This link has expired.</h5>
			<h5 v-else-if="!loading" class="uppercase italic text-xs font-bold">There was an error</h5>
			<h5 v-else-if="loading" class="uppercase tracking-wide text-xs font-bold">Loading</h5>
		</transition>
	</div>
</template>
