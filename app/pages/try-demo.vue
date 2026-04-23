<script setup lang="ts">
/**
 * /try-demo — public entry point into the shared demo workspace.
 *
 * Click → POST /api/auth/demo-login → full-reload to /?tour=1 so the
 * walkthrough plugin picks up the flag on the authenticated dashboard.
 *
 * (The original spec targeted /ai, which doesn't exist as a route. The
 * dashboard index is the logical substitute since the Earnest AI pane
 * opens from there.)
 */
import { toast } from 'vue-sonner';

definePageMeta({
	layout: 'auth',
	middleware: 'guest',
});

useHead({ title: 'Try the demo | Earnest' });

const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function startDemo() {
	if (isLoading.value) return;
	isLoading.value = true;
	errorMessage.value = null;

	try {
		await $fetch('/api/auth/demo-login', { method: 'POST' });
		toast.success("You're in. Earnest is loading…");
		// Full reload so the auth-aware layout + walkthrough plugin boot fresh.
		window.location.href = '/?tour=1';
	} catch (err: any) {
		const msg = err?.data?.message || err?.message || 'Could not start the demo. Please try again.';
		errorMessage.value = msg;
		toast.error(msg);
		isLoading.value = false;
	}
}
</script>

<template>
	<div class="w-full max-w-md text-center">
		<h1 class="text-2xl font-semibold text-foreground">Take Earnest for a spin</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			We'll drop you into a shared demo workspace seeded with sample clients, leads,
			invoices, and tickets. You can chat with Earnest, browse the pipeline, and see
			how everything fits together — no signup required.
		</p>

		<button
			type="button"
			:disabled="isLoading"
			class="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
			@click="startDemo"
		>
			<span v-if="isLoading">Loading demo…</span>
			<span v-else>Start demo</span>
		</button>

		<p v-if="errorMessage" class="mt-4 text-xs text-destructive">{{ errorMessage }}</p>

		<p class="mt-8 text-xs text-muted-foreground">
			Demo data is shared across visitors and resets periodically. Already have an account?
			<NuxtLink to="/auth/signin" class="underline">Sign in</NuxtLink>.
		</p>
	</div>
</template>
