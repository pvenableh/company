<script setup>
import { jwtDecode } from 'jwt-decode';

definePageMeta({
	layout: 'auth',
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { fetchSession } = useDirectusAuth();

const membershipId = ref(route.query.membership || '');
const directusToken = ref(route.query.token || '');

const membership = ref(null);
const loading = ref(true);
const accepting = ref(false);
const password = ref('');
const confirmPassword = ref('');
const passwordError = ref('');
const showPassword = ref(false);
const error = ref('');

// Determine if this is a new user (needs password)
const isNewUser = computed(() => {
	return membership.value?.user?.status === 'invited';
});

const orgName = computed(() => membership.value?.organization?.name || 'the organization');
const roleName = computed(() => membership.value?.role?.name || 'Member');

onMounted(async () => {
	if (!membershipId.value) {
		error.value = 'Missing invitation details. Please check your invitation link.';
		loading.value = false;
		return;
	}

	try {
		// Fetch membership details via a lightweight server endpoint
		const data = await $fetch('/api/org/invite-details', {
			method: 'POST',
			body: { membershipId: membershipId.value },
		});

		if (!data.success) {
			error.value = data.message || 'Invalid invitation';
			loading.value = false;
			return;
		}

		membership.value = data.membership;
	} catch (err) {
		console.error('Failed to fetch invite details:', err);
		error.value = err?.data?.message || 'Failed to load invitation details';
	} finally {
		loading.value = false;
	}
});

function validatePassword() {
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
}

async function acceptInvite() {
	if (isNewUser.value && !validatePassword()) return;

	accepting.value = true;
	try {
		const result = await $fetch('/api/org/accept-invite', {
			method: 'POST',
			body: {
				membershipId: membershipId.value,
				password: isNewUser.value ? password.value : undefined,
				directusToken: directusToken.value || undefined,
			},
		});

		toast.add({
			title: 'Welcome!',
			description: `You have joined ${orgName.value} as ${roleName.value}`,
			color: 'green',
		});

		// If auto-login succeeded, go to dashboard
		if (result.login?.loggedIn) {
			await fetchSession();
			setTimeout(() => {
				window.location.href = '/';
			}, 1000);
		} else {
			// Redirect to login
			setTimeout(() => {
				router.push('/auth/signin');
			}, 2000);
		}
	} catch (err) {
		const message = err?.data?.message || err?.message || 'Failed to accept invitation';
		toast.add({ title: 'Error', description: message, color: 'red' });
	} finally {
		accepting.value = false;
	}
}
</script>

<template>
	<div class="w-full max-w-md">
		<!-- Loading -->
		<div v-if="loading" class="text-center">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" />
			<p class="text-sm t-text-muted uppercase tracking-wide font-bold">Loading invitation...</p>
		</div>

		<!-- Error -->
		<UCard v-else-if="error" class="w-full max-w-md text-center">
			<div class="py-4">
				<UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-amber-500 mx-auto mb-4" />
				<p class="mb-2">{{ error }}</p>
				<p class="text-sm t-text-muted mb-4">Please check the URL or contact your administrator.</p>
				<UButton variant="ghost" @click="router.push('/auth/signin')">Go to Login</UButton>
			</div>
		</UCard>

		<!-- Already accepted -->
		<UCard v-else-if="membership?.status !== 'pending'" class="w-full max-w-md text-center">
			<div class="py-4">
				<UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-500 mx-auto mb-4" />
				<p class="mb-2">This invitation has already been accepted.</p>
				<UButton color="primary" @click="router.push('/auth/signin')">Sign In</UButton>
			</div>
		</UCard>

		<!-- Accept Invitation -->
		<UCard v-else class="w-full max-w-md">
			<template #header>
				<div class="text-center">
					<h3 class="text-lg font-semibold">Join {{ orgName }}</h3>
					<p class="text-sm t-text-secondary mt-1">
						You've been invited to join as <strong>{{ roleName }}</strong>
					</p>
				</div>
			</template>

			<div class="space-y-4">
				<!-- Invitation details -->
				<div class="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 space-y-2">
					<div class="flex items-center justify-between text-sm">
						<span class="t-text-muted">Organization</span>
						<span class="font-medium">{{ orgName }}</span>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span class="t-text-muted">Role</span>
						<span class="font-medium">{{ roleName }}</span>
					</div>
					<div v-if="membership?.client?.name" class="flex items-center justify-between text-sm">
						<span class="t-text-muted">Client</span>
						<span class="font-medium">{{ membership.client.name }}</span>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span class="t-text-muted">Email</span>
						<span class="font-medium">{{ membership?.user?.email }}</span>
					</div>
				</div>

				<!-- New user: password fields -->
				<template v-if="isNewUser">
					<p class="text-sm t-text-secondary">
						Set a password to create your account.
					</p>

					<UFormGroup label="Password" required :error="passwordError">
						<div class="relative">
							<UInput
								v-model="password"
								:type="showPassword ? 'text' : 'password'"
								placeholder="Choose a password"
							/>
							<button
								type="button"
								class="absolute right-2 top-1/2 -translate-y-1/2 t-text-muted hover:t-text-default"
								@click="showPassword = !showPassword"
							>
								<UIcon :name="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
							</button>
						</div>
					</UFormGroup>

					<UFormGroup label="Confirm Password">
						<UInput
							v-model="confirmPassword"
							:type="showPassword ? 'text' : 'password'"
							placeholder="Confirm your password"
						/>
					</UFormGroup>
				</template>

				<!-- Existing user: just confirm -->
				<p v-else class="text-sm t-text-secondary">
					Click below to accept the invitation and join the organization.
				</p>

				<UButton
					color="primary"
					block
					:loading="accepting"
					@click="acceptInvite"
				>
					{{ isNewUser ? 'Create Account & Join' : 'Accept Invitation' }}
				</UButton>

				<p class="text-center text-xs t-text-muted">
					<NuxtLink to="/auth/signin" class="underline hover:t-text-default">
						Already have an account? Sign in
					</NuxtLink>
				</p>
			</div>
		</UCard>
	</div>
</template>
