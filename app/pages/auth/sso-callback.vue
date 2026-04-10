<script setup lang="ts">
/**
 * SSO Callback Page
 *
 * Directus redirects here after a successful OAuth login with tokens in the URL.
 * Directus uses different return formats depending on the mode:
 *   - Fragment: /auth/sso-callback#access_token=xxx&refresh_token=xxx&expires=900000
 *   - Query:   /auth/sso-callback?access_token=xxx&refresh_token=xxx&expires=900000
 *
 * This page captures the tokens, sends them to our server endpoint to create
 * a session, then redirects to the app.
 */
import { Loader2 } from 'lucide-vue-next';

definePageMeta({
  layout: 'auth',
  middleware: 'guest',
});

const status = ref<'processing' | 'success' | 'error'>('processing');
const errorMessage = ref<string | null>(null);

onMounted(async () => {
  try {
    // Directus may return tokens in hash fragment or query params
    const params = extractTokens();

    if (!params.access_token || !params.refresh_token) {
      throw new Error('No authentication tokens received from provider');
    }

    // Send tokens to our server to create a session
    await $fetch('/api/auth/sso-callback', {
      method: 'POST',
      body: {
        access_token: params.access_token,
        refresh_token: params.refresh_token,
        expires: params.expires ? parseInt(params.expires) : 900000,
      },
    });

    status.value = 'success';

    // Redirect to app — small delay so user sees success state
    setTimeout(() => {
      window.location.href = '/';
    }, 500);
  } catch (err: any) {
    console.error('SSO callback error:', err);
    status.value = 'error';
    errorMessage.value = err?.data?.message || err?.message || 'Authentication failed. Please try again.';
  }
});

/**
 * Extract tokens from URL hash fragment or query params.
 * Directus uses fragment mode by default for SSO.
 */
function extractTokens(): Record<string, string> {
  const result: Record<string, string> = {};

  // Try hash fragment first (Directus default)
  if (window.location.hash) {
    const hash = window.location.hash.substring(1); // Remove the #
    const hashParams = new URLSearchParams(hash);
    for (const [key, value] of hashParams) {
      result[key] = value;
    }
  }

  // Also check query params as fallback
  const query = new URLSearchParams(window.location.search);
  for (const [key, value] of query) {
    if (!result[key]) {
      result[key] = value;
    }
  }

  return result;
}
</script>

<template>
  <div class="w-full max-w-sm">
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <div class="flex flex-col items-center justify-center p-8 space-y-4 min-h-[200px]">
        <!-- Processing -->
        <template v-if="status === 'processing'">
          <Loader2 class="h-8 w-8 animate-spin text-primary" />
          <p class="text-sm text-muted-foreground">Completing sign in...</p>
        </template>

        <!-- Success -->
        <template v-else-if="status === 'success'">
          <div class="h-8 w-8 rounded-full bg-green-500/20 dark:bg-green-500/15 flex items-center justify-center">
            <UIcon name="i-heroicons-check" class="h-5 w-5 text-green-500 dark:text-green-400" />
          </div>
          <p class="text-sm text-muted-foreground">Signed in successfully. Redirecting...</p>
        </template>

        <!-- Error -->
        <template v-else>
          <div class="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center">
            <UIcon name="i-heroicons-x-mark" class="h-5 w-5 text-destructive" />
          </div>
          <p class="text-sm text-destructive text-center">{{ errorMessage }}</p>
          <button
            class="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            @click="navigateTo('/auth/signin')"
          >
            Back to Sign In
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
