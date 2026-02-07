<script setup>
import { jwtDecode } from 'jwt-decode';

const route = useRoute();
const { acceptUserInvite } = useDirectusAuth();
const toast = useToast();

const invite_token = ref(route.query.token ? route.query.token : '');
const decoded = ref(null);
const expired = ref(false);
const expiredDate = ref('');
const loading = ref(true);
const password = ref('');
const confirmPassword = ref('');
const passwordError = ref('');
const showPassword = ref(false);
const router = useRouter();

onMounted(() => {
	if (invite_token.value) {
		try {
			decoded.value = jwtDecode(invite_token.value);
			expiredDate.value = new Date(decoded.value.exp * 1000);

			// Check if token is expired
			if (expiredDate.value > new Date()) {
				expired.value = false;
			} else {
				expired.value = true;
			}
		} catch (error) {
			console.error('Error decoding token:', error);
			toast.add({
				title: 'Error',
				description: 'Invalid invitation token',
				color: 'red',
			});
		}
	}
	loading.value = false;
});

const validatePassword = () => {
	passwordError.value = '';

	if (!password.value) {
		passwordError.value = 'Password is required';
		return false;
	}

	if (password.value.length < 8) {
		passwordError.value = 'Password must be at least 8 characters';
		return false;
	}

	if (password.value !== confirmPassword.value) {
		passwordError.value = 'Passwords do not match';
		return false;
	}

	return true;
};

const submit = async () => {
	if (!validatePassword()) {
		return;
	}

	try {
		loading.value = true;
		await acceptUserInvite(invite_token.value, password.value);

		toast.add({
			title: 'Success',
			description: 'Account created successfully. Please log in.',
			color: 'green',
		});

		// Redirect to login page
		setTimeout(() => {
			router.push('/auth/signin');
		}, 2000);
	} catch (error) {
		console.error('Error accepting invitation:', error);
		toast.add({
			title: 'Error',
			description: error.message || 'Failed to create account',
			color: 'red',
		});
	} finally {
		loading.value = false;
	}
};

const togglePassword = () => {
	showPassword.value = !showPassword.value;
};
</script>

<template>
	<div class="flex items-center justify-center flex-col min-h-[90svh]">
		<UCard v-if="!loading" class="w-full max-w-md">
			<template #header>
				<div class="text-center">
					<h3 class="text-lg font-medium" v-if="!expired && decoded">Accept Invitation</h3>
					<h3 class="text-lg font-medium" v-else>Invitation</h3>
				</div>
			</template>

			<div v-if="!expired && decoded" class="space-y-4">
				<p>
					Create your account for
					<strong>{{ decoded?.email }}</strong>
				</p>
				<p class="text-xs text-gray-500">Invitation expires {{ getRelativeTime(expiredDate) }}</p>

				<UFormGroup label="Password" :error="passwordError">
					<div class="relative">
						<UInput
							v-model="password"
							:type="showPassword ? 'text' : 'password'"
							placeholder="Set your password"
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
				</UFormGroup>

				<UFormGroup label="Confirm Password">
					<UInput
						v-model="confirmPassword"
						:type="showPassword ? 'text' : 'password'"
						placeholder="Confirm your password"
					/>
				</UFormGroup>

				<UButton type="submit" :loading="loading" block @click="submit" label="Create Account" />
			</div>

			<div v-else-if="expired" class="text-center py-4">
				<UIcon name="i-heroicons-exclamation-circle" class="text-3xl text-amber-500 mb-4" />
				<p class="text-gray-700 dark:text-gray-300">This invitation link has expired.</p>
				<p class="text-sm text-gray-500 mt-2">Please contact your administrator for a new invitation.</p>
				<UButton to="/auth/signin" class="mt-4" variant="ghost" label="Go to Login" />
			</div>

			<div v-else class="text-center py-4">
				<UIcon name="i-heroicons-exclamation-circle" class="text-3xl text-amber-500 mb-4" />
				<p class="text-gray-700 dark:text-gray-300">Invalid invitation link.</p>
				<p class="text-sm text-gray-500 mt-2">Please check the URL or contact your administrator.</p>
				<UButton to="/auth/signin" class="mt-4" variant="ghost" label="Go to Login" />
			</div>
		</UCard>

		<div v-else class="text-center">
			<p class="uppercase tracking-wide text-xs font-bold">Loading...</p>
		</div>
	</div>
</template>
