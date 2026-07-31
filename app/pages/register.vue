<script setup lang="ts">
import { toast } from 'vue-sonner';

definePageMeta({
	// The shared OnboardingShell owns the chrome — this is step 1 of the journey.
	layout: false,
	middleware: 'guest',
});
useHead({ title: 'Register | Earnest' });

// Inline explainer for the "joining a team" path (invites are email deep-links).
const showJoinHelp = ref(false);

const { register } = useDirectusAuth();
const route = useRoute();
const config = useRuntimeConfig();

// ── Referral branding ───────────────────────────────────────────────────────
// `?ref=<orgId>` marks a subscriber referral. We brand the signup as the
// referring agency and thread the id through registration for attribution.
const referrerId = computed(() => {
	const r = route.query.ref;
	return typeof r === 'string' && r ? r : null;
});

interface Referrer {
	id: string;
	name: string | null;
	logo: string | null;
	brand_color: string | null;
}
const referrer = ref<Referrer | null>(null);

const referrerLogoUrl = computed(() => {
	if (!referrer.value?.logo) return null;
	return `${config.public.directusUrl}/assets/${referrer.value.logo}?width=240&quality=90`;
});
const referrerStyle = computed(() =>
	referrer.value?.brand_color
		? { '--ref-brand': referrer.value.brand_color, '--ref-brand-soft': `${referrer.value.brand_color}1f` }
		: { '--ref-brand': 'hsl(var(--primary))', '--ref-brand-soft': 'hsl(var(--primary) / 0.12)' },
);

onMounted(async () => {
	if (!referrerId.value) return;
	try {
		referrer.value = await $fetch<Referrer>('/api/org/referral-brand', {
			query: { ref: referrerId.value },
		});
	} catch {
		// Unknown/invalid ref — fall back to the plain Earnest signup silently.
		referrer.value = null;
	}
});

async function handleRegister(values: {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
	organizationName?: string;
	termsAccepted: boolean;
}) {
	try {
		await register({
			first_name: values.firstName,
			last_name: values.lastName,
			email: values.email,
			password: values.password,
			organization_name: values.organizationName || undefined,
			terms_accepted: values.termsAccepted,
			// Attribution: only sent when a valid referrer resolved.
			referred_by: referrer.value?.id || undefined,
		});

		toast.success('Account created! Redirecting...');

		// Go straight into the org wizard so the journey reads as one continuous
		// flow (no flash through the app shell + needs-org bounce).
		const redirectTo = route.query.redirect ? decodeURIComponent(route.query.redirect as string) : '/organization/new';
		setTimeout(() => {
			window.location.href = redirectTo;
		}, 1000);
	} catch (err: any) {
		const message = err?.data?.message || err?.message || 'Failed to create account';
		toast.error(message);
	}
}
</script>

<template>
	<OnboardingShell
		:step="1"
		:total="9"
		mood="warm"
		eyebrow="Welcome to Earnest"
		title="Create your account"
		subtitle="First your details — then Earnest walks you through setting up your workspace."
	>
		<div class="w-full">
			<!-- Referral banner — brands the signup as the referring agency. -->
			<div v-if="referrer" class="referral-banner" :style="referrerStyle">
				<div class="referral-banner__logo">
					<img v-if="referrerLogoUrl" :src="referrerLogoUrl" :alt="referrer.name || 'Referrer'" />
					<span v-else>{{ (referrer.name || 'E').charAt(0).toUpperCase() }}</span>
				</div>
				<div class="min-w-0">
					<p class="referral-banner__title">
						<strong>{{ referrer.name || 'A partner' }}</strong> invited you to Earnest
					</p>
					<p class="referral-banner__sub">
						Create your own workspace — you'll both get bonus credits when you go paid.
					</p>
				</div>
			</div>

			<AuthRegisterForm
				bare
				@submit="handleRegister"
				@login="navigateTo('/auth/signin')"
			/>

			<!-- Secondary paths: sign in, or join an existing team via invite. -->
			<div class="mt-5 space-y-2 text-center text-sm text-muted-foreground">
				<p>
					Already have an account?
					<NuxtLink to="/auth/signin" class="text-foreground font-medium hover:underline underline-offset-4">Sign in</NuxtLink>
				</p>
				<p>
					Joining a team?
					<button
						type="button"
						class="text-foreground font-medium hover:underline underline-offset-4"
						@click="showJoinHelp = !showJoinHelp"
					>Use your invite</button>
				</p>
				<p v-if="showJoinHelp" class="text-[12px] leading-relaxed text-muted-foreground/80 max-w-sm mx-auto">
					Team invites arrive by email. Open the link in your invitation to join your
					team's workspace — no need to create a new organization here.
				</p>
			</div>
		</div>
	</OnboardingShell>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.referral-banner {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
	margin-bottom: 20px;
	border-radius: 14px;
	border: 1px solid hsl(var(--border));
	background: var(--ref-brand-soft);
}

.referral-banner__logo {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	border-radius: 10px;
	flex-shrink: 0;
	overflow: hidden;
	background: var(--ref-brand);
	color: #fff;
	font-weight: 700;
}

.referral-banner__logo img {
	width: 100%;
	height: 100%;
	object-fit: contain;
	background: #fff;
}

.referral-banner__title {
	font-size: 13px;
	color: hsl(var(--foreground));
	line-height: 1.3;
}

.referral-banner__sub {
	font-size: 12px;
	color: hsl(var(--muted-foreground));
	line-height: 1.3;
	margin-top: 2px;
}
</style>
