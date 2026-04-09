<script setup lang="ts">
useHead({ title: 'Unsubscribe | Earnest' });

const route = useRoute();
const token = route.query.token as string;

const status = ref<'loading' | 'success' | 'error'>('loading');
const email = ref('');
const errorMessage = ref('');

onMounted(async () => {
  if (!token) {
    status.value = 'error';
    errorMessage.value = 'Invalid unsubscribe link.';
    return;
  }

  try {
    const result = await $fetch<{ success: boolean; email?: string; error?: string }>(
      '/api/email/unsubscribe',
      {
        method: 'POST',
        body: { token },
      }
    );

    if (result.success) {
      status.value = 'success';
      email.value = result.email || '';
    } else {
      status.value = 'error';
      errorMessage.value = result.error || 'Unable to process your request.';
    }
  } catch {
    status.value = 'error';
    errorMessage.value = 'Something went wrong. Please try again later.';
  }
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background">
    <div class="max-w-md w-full mx-4 text-center">
      <!-- Loading -->
      <div v-if="status === 'loading'" class="space-y-4">
        <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p class="text-muted-foreground">Processing your request...</p>
      </div>

      <!-- Success -->
      <div v-if="status === 'success'" class="space-y-4">
        <div class="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <Icon name="lucide:check" class="w-8 h-8 text-green-600" />
        </div>
        <h1 class="text-2xl font-semibold">You've been unsubscribed</h1>
        <p class="text-muted-foreground">
          <span v-if="email">{{ email }} has</span>
          <span v-else>You have</span>
          been removed from our mailing lists. You will no longer receive marketing emails from us.
        </p>
        <p class="text-sm text-muted-foreground mt-4">
          If this was a mistake, you can contact us to re-subscribe.
        </p>
      </div>

      <!-- Error -->
      <div v-if="status === 'error'" class="space-y-4">
        <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <Icon name="lucide:alert-triangle" class="w-8 h-8 text-red-600" />
        </div>
        <h1 class="text-2xl font-semibold">Unable to Unsubscribe</h1>
        <p class="text-muted-foreground">{{ errorMessage }}</p>
        <p class="text-sm text-muted-foreground mt-4">
          Please contact us directly if you'd like to be removed from our mailing list.
        </p>
      </div>
    </div>
  </div>
</template>
