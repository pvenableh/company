<script setup>
import { jwtDecode } from 'jwt-decode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-vue-next';

definePageMeta({
	layout: 'auth',
	middleware: 'guest',
});

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
	<div class="w-full max-w-md">
		<Card v-if="!loading" class="w-full max-w-md">
			<CardHeader class="text-center">
				<h3 class="text-lg font-medium" v-if="!expired && decoded">Accept Invitation</h3>
				<h3 class="text-lg font-medium" v-else>Invitation</h3>
			</CardHeader>

			<CardContent>
				<div v-if="!expired && decoded" class="space-y-4">
					<p>
						Create your account for
						<strong>{{ decoded?.email }}</strong>
					</p>
					<p class="text-xs text-muted-foreground">Invitation expires {{ getRelativeTime(expiredDate) }}</p>

					<Field>
						<FieldLabel for="invite-password">Password <span class="text-destructive">*</span></FieldLabel>
						<div class="relative">
							<Input
								id="invite-password"
								v-model="password"
								:type="showPassword ? 'text' : 'password'"
								placeholder="Set your password"
								class="pr-10"
							/>
							<button
								type="button"
								class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								@click="togglePassword"
							>
								<EyeOff v-if="showPassword" class="size-4" />
								<Eye v-else class="size-4" />
							</button>
						</div>
						<FieldError v-if="passwordError" :errors="[passwordError]" />
					</Field>

					<Field>
						<FieldLabel for="invite-confirm-password">Confirm Password</FieldLabel>
						<Input
							id="invite-confirm-password"
							v-model="confirmPassword"
							:type="showPassword ? 'text' : 'password'"
							placeholder="Confirm your password"
						/>
					</Field>

					<Button type="submit" :disabled="loading" class="w-full" @click="submit">
						<Loader2 v-if="loading" class="mr-2 size-4 animate-spin" />
						{{ loading ? 'Creating...' : 'Create Account' }}
					</Button>
				</div>

				<div v-else-if="expired" class="text-center py-4">
					<AlertCircle class="mx-auto size-8 text-amber-500 mb-4" />
					<p class="text-foreground">This invitation link has expired.</p>
					<p class="text-sm text-muted-foreground mt-2">Please contact your administrator for a new invitation.</p>
					<Button variant="ghost" as-child class="mt-4">
						<NuxtLink to="/auth/signin">Go to Login</NuxtLink>
					</Button>
				</div>

				<div v-else class="text-center py-4">
					<AlertCircle class="mx-auto size-8 text-amber-500 mb-4" />
					<p class="text-foreground">Invalid invitation link.</p>
					<p class="text-sm text-muted-foreground mt-2">Please check the URL or contact your administrator.</p>
					<Button variant="ghost" as-child class="mt-4">
						<NuxtLink to="/auth/signin">Go to Login</NuxtLink>
					</Button>
				</div>
			</CardContent>
		</Card>

		<div v-else class="text-center">
			<Loader2 class="mx-auto size-6 animate-spin text-muted-foreground mb-2" />
			<p class="uppercase tracking-wide text-xs font-bold text-muted-foreground">Loading...</p>
		</div>
	</div>
</template>
