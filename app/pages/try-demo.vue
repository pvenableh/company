<script setup lang="ts">
/**
 * /try-demo — public entry point into the demo workspaces.
 *
 * Two personas: Solo studio (Member role, `/api/auth/demo-login`) and
 * Agency team (Admin role, `/api/auth/demo-agency-login`). Clicking either
 * posts to the matching endpoint and full-reloads into Earnest.
 *
 * Query params:
 *   ?persona=solo|agency    Pre-select a persona (for marketing-site deep links).
 *                           Both personas auto-start; the chooser only shows
 *                           if neither is requested.
 *   ?redirect=/path         Where to land after login. Must be a same-origin
 *                           path (leading `/`, no `//` or scheme). If absent,
 *                           defaults to `/?tour=1` so the walkthrough plugin
 *                           boots on the dashboard.
 */
import { toast } from 'vue-sonner';

definePageMeta({
	layout: 'auth',
	middleware: 'guest',
});

useHead({ title: 'Try the demo | Earnest' });

type Persona = 'solo' | 'agency';

const route = useRoute();

const loadingPersona = ref<Persona | null>(null);
const errorMessage = ref<string | null>(null);

const ENDPOINTS: Record<Persona, string> = {
	solo: '/api/auth/demo-login',
	agency: '/api/auth/demo-agency-login',
};

/** Only accept same-origin paths to block open-redirect abuse. */
function sanitizeRedirect(raw: unknown): string | null {
	if (typeof raw !== 'string' || !raw) return null;
	if (!raw.startsWith('/')) return null;
	// Block protocol-relative URLs like `//evil.com` and `/\evil.com`.
	if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
	return raw;
}

const redirectParam = computed(() => sanitizeRedirect(route.query.redirect));

/** Path to send the browser to after a successful demo-login. */
function resolveLandingUrl(): string {
	return redirectParam.value ?? '/?tour=1';
}

async function startDemo(persona: Persona) {
	if (loadingPersona.value) return;
	loadingPersona.value = persona;
	errorMessage.value = null;

	try {
		await $fetch(ENDPOINTS[persona], { method: 'POST' });
		toast.success("You're in. Earnest is loading…");
		// Full reload so the auth-aware layout + walkthrough plugin boot fresh.
		window.location.href = resolveLandingUrl();
	} catch (err: any) {
		const msg = err?.data?.message || err?.message || 'Could not start the demo. Please try again.';
		errorMessage.value = msg;
		toast.error(msg);
		loadingPersona.value = null;
	}
}

// Marketing-site deep links pass `?persona=solo|agency` to skip the chooser.
// If the value isn't recognized (or absent) the chooser renders as normal.
onMounted(() => {
	const persona = route.query.persona;
	if (persona === 'solo' || persona === 'agency') {
		startDemo(persona);
	}
});
</script>

<template>
	<div class="w-full max-w-3xl text-center">
		<h1 class="text-2xl font-semibold text-foreground">Take Earnest for a spin</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Pick the workspace that looks most like yours. We'll drop you in with sample data and a
			quick guided tour — no signup required.
		</p>

		<div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
			<!-- Solo studio -->
			<button
				type="button"
				:disabled="loadingPersona !== null"
				class="group relative rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/60 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
				@click="startDemo('solo')"
			>
				<div class="flex items-center gap-2">
					<div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Icon name="lucide:user" class="h-4 w-4" />
					</div>
					<h2 class="text-base font-semibold text-foreground">Solo studio</h2>
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					You're the designer, PM, and AR team in one. A couple of clients, a live project,
					one invoice out. See how Earnest keeps the plates spinning.
				</p>
				<div class="mt-4 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition group-hover:opacity-90">
					<span v-if="loadingPersona === 'solo'">Loading demo…</span>
					<span v-else>Start as solo →</span>
				</div>
			</button>

			<!-- Agency team -->
			<button
				type="button"
				:disabled="loadingPersona !== null"
				class="group relative rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/60 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
				@click="startDemo('agency')"
			>
				<div class="flex items-center gap-2">
					<div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Icon name="lucide:users" class="h-4 w-4" />
					</div>
					<h2 class="text-base font-semibold text-foreground">Agency team</h2>
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					Creative + delivery pods, a full pipeline, teammates picking up tasks, a marketing
					campaign in flight. You'll see the Admin view — teams, marketing, billing.
				</p>
				<div class="mt-4 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition group-hover:opacity-90">
					<span v-if="loadingPersona === 'agency'">Loading demo…</span>
					<span v-else>Start as agency →</span>
				</div>
			</button>
		</div>

		<p v-if="errorMessage" class="mt-4 text-xs text-destructive">{{ errorMessage }}</p>

		<p class="mt-8 text-xs text-muted-foreground">
			Demo data is shared across visitors and resets periodically. Already have an account?
			<NuxtLink to="/auth/signin" class="underline">Sign in</NuxtLink>.
		</p>
	</div>
</template>
