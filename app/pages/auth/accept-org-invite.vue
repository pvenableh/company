<script setup>
// Branded org/portal invite acceptance.
//
// The invite link (`?membership=<id>`) points at either an org_memberships row
// (staff) or a client_portal_users row (client). /api/org/invite-details
// resolves both and returns the inviting org's brand (logo, brand_color,
// whitelabel) so this page renders as the AGENCY, not generic Earnest —
// matching the branded invite email the user just clicked.
//
// layout:false because the shared `auth` layout hard-renders the Earnest logo
// and tagline above the slot; a branded invite needs to own its whole chrome.
definePageMeta({
	layout: false,
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const config = useRuntimeConfig();
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

const org = computed(() => membership.value?.organization || null);
const orgName = computed(() => org.value?.name || 'the organization');
const roleName = computed(() => membership.value?.role?.name || 'Member');
const isPortalInvite = computed(() => membership.value?.role?.slug === 'client');

// ── Branding ──────────────────────────────────────────────────────────────
// brand_color falls back to null (→ theme primary). Logo id may arrive as a
// bare id or an expanded file object; normalize either way.
const brandColor = computed(() => org.value?.brand_color || null);
const logoUrl = computed(() => {
	const logo = org.value?.logo;
	const id = typeof logo === 'object' ? logo?.id : logo;
	if (!id) return null;
	return `${config.public.directusUrl}/assets/${id}?width=320&quality=90`;
});
// Whitelabel (on a supporting plan) suppresses the "Powered by Earnest" mark.
const showEarnestMark = computed(() => !org.value?.whitelabel);

// CSS vars scoped to this page so brand color drives the accents without
// touching global theme tokens.
const brandStyle = computed(() =>
	brandColor.value
		? { '--brand': brandColor.value, '--brand-ring': `${brandColor.value}33` }
		: { '--brand': 'hsl(var(--primary))', '--brand-ring': 'hsl(var(--primary) / 0.2)' },
);

onMounted(async () => {
	if (!membershipId.value) {
		error.value = 'Missing invitation details. Please check your invitation link.';
		loading.value = false;
		return;
	}

	try {
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

		// Portal users land in the portal; staff land on the dashboard.
		const destination = isPortalInvite.value ? '/portal' : '/';

		if (result.login?.loggedIn) {
			await fetchSession();
			setTimeout(() => {
				window.location.href = destination;
			}, 1000);
		} else {
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
	<div class="invite-shell" :style="brandStyle">
		<main class="invite-content">
			<!-- Org brand mark -->
			<div class="invite-brand">
				<img v-if="logoUrl" :src="logoUrl" :alt="orgName" class="invite-logo" />
				<div v-else class="invite-logo-fallback">
					{{ orgName.charAt(0).toUpperCase() }}
				</div>
			</div>

			<div class="w-full max-w-md">
				<!-- Loading -->
				<div v-if="loading" class="text-center py-8">
					<EIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
					<p class="text-sm text-muted-foreground uppercase tracking-wide font-bold">Loading invitation…</p>
				</div>

				<!-- Error -->
				<div v-else-if="error" class="ios-card p-6 text-center">
					<EIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-warning mx-auto mb-4" />
					<p class="mb-2">{{ error }}</p>
					<p class="text-sm text-muted-foreground mb-4">Please check the URL or contact your administrator.</p>
					<EButton variant="ghost" @click="router.push('/auth/signin')">Go to Login</EButton>
				</div>

				<!-- Already accepted -->
				<div v-else-if="membership?.status !== 'pending'" class="ios-card p-6 text-center">
					<EIcon name="i-heroicons-check-circle" class="w-8 h-8 text-success mx-auto mb-4" />
					<p class="mb-4">This invitation has already been accepted.</p>
					<button class="invite-btn" @click="router.push('/auth/signin')">Sign In</button>
				</div>

				<!-- Accept Invitation -->
				<div v-else class="ios-card overflow-hidden">
					<div class="invite-header">
						<h3 class="text-lg font-semibold text-foreground">Join {{ orgName }}</h3>
						<p class="text-sm text-muted-foreground mt-1">
							{{ isPortalInvite ? 'You\'ve been invited to the client portal' : 'You\'ve been invited to join' }}
							<template v-if="!isPortalInvite">as <strong class="text-foreground">{{ roleName }}</strong></template>
						</p>
					</div>

					<div class="p-5 space-y-4">
						<!-- Invitation details -->
						<div class="rounded-xl bg-muted/40 p-4 space-y-2">
							<div class="flex items-center justify-between text-sm">
								<span class="text-muted-foreground">Organization</span>
								<span class="font-medium text-foreground">{{ orgName }}</span>
							</div>
							<div class="flex items-center justify-between text-sm">
								<span class="text-muted-foreground">{{ isPortalInvite ? 'Access' : 'Role' }}</span>
								<span class="font-medium text-foreground">{{ roleName }}</span>
							</div>
							<div v-if="membership?.client?.name" class="flex items-center justify-between text-sm">
								<span class="text-muted-foreground">Client</span>
								<span class="font-medium text-foreground">{{ membership.client.name }}</span>
							</div>
							<div class="flex items-center justify-between text-sm">
								<span class="text-muted-foreground">Email</span>
								<span class="font-medium text-foreground">{{ membership?.user?.email }}</span>
							</div>
						</div>

						<!-- New user: password fields -->
						<template v-if="isNewUser">
							<p class="text-sm text-muted-foreground">Set a password to create your account.</p>

							<EFormGroup label="Password" required :error="passwordError">
								<div class="relative">
									<EInput
										v-model="password"
										:type="showPassword ? 'text' : 'password'"
										placeholder="Choose a password"
									/>
									<button
										type="button"
										class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
										@click="showPassword = !showPassword"
									>
										<EIcon :name="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
									</button>
								</div>
							</EFormGroup>

							<EFormGroup label="Confirm Password">
								<EInput
									v-model="confirmPassword"
									:type="showPassword ? 'text' : 'password'"
									placeholder="Confirm your password"
								/>
							</EFormGroup>
						</template>

						<!-- Existing user: just confirm -->
						<p v-else class="text-sm text-muted-foreground">
							Click below to accept the invitation and join.
						</p>

						<button class="invite-btn" :disabled="accepting" @click="acceptInvite">
							<EIcon v-if="accepting" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
							<span>{{ isNewUser ? 'Create Account & Join' : 'Accept Invitation' }}</span>
						</button>

						<p class="text-center text-xs text-muted-foreground">
							<NuxtLink to="/auth/signin" class="underline hover:text-foreground">
								Already have an account? Sign in
							</NuxtLink>
						</p>
					</div>
				</div>
			</div>

			<!-- Powered by Earnest (suppressed for whitelabel orgs) -->
			<footer v-if="showEarnestMark" class="invite-footer">
				<span>Powered by</span>
				<LogoEarnest size="sm" />
			</footer>
		</main>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.invite-shell {
	position: relative;
	min-height: 100svh;
	display: flex;
	flex-direction: column;
	background: hsl(var(--background));
	color: hsl(var(--foreground));
	-webkit-font-smoothing: antialiased;
	/* A soft wash of the org's brand color at the top of the page. */
	background-image: radial-gradient(120% 60% at 50% 0%, var(--brand-ring) 0%, transparent 60%);
}

.invite-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 48px 16px 24px;
	gap: 28px;
}

.invite-brand {
	display: flex;
	align-items: center;
	justify-content: center;
}

.invite-logo {
	max-height: 56px;
	max-width: 220px;
	object-fit: contain;
}

.invite-logo-fallback {
	width: 56px;
	height: 56px;
	border-radius: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 24px;
	font-weight: 700;
	color: #fff;
	background: var(--brand);
	box-shadow: 0 6px 20px var(--brand-ring);
}

.invite-header {
	text-align: center;
	padding: 24px 20px 16px;
	border-bottom: 1px solid hsl(var(--border));
	/* Brand-tinted header band. */
	background: linear-gradient(180deg, var(--brand-ring) 0%, transparent 100%);
}

.invite-btn {
	width: 100%;
	height: 44px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	border-radius: 12px;
	font-size: 14px;
	font-weight: 600;
	color: #fff;
	background: var(--brand);
	box-shadow: 0 2px 10px var(--brand-ring);
	transition: opacity 0.15s, transform 0.1s;
}

.invite-btn:hover:not(:disabled) {
	opacity: 0.92;
}

.invite-btn:active:not(:disabled) {
	transform: translateY(1px);
}

.invite-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.invite-footer {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 16px;
	font-size: 11px;
	letter-spacing: 0.04em;
	color: hsl(var(--muted-foreground));
	opacity: 0.7;
}
</style>
