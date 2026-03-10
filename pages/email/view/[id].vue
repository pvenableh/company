<template>
  <div class="email-web-view">
    <div v-if="loading" class="flex items-center justify-center min-h-screen bg-gray-100">
      <div class="text-center">
        <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
        <p class="text-muted-foreground text-sm">Loading email...</p>
      </div>
    </div>

    <div v-else-if="error" class="flex items-center justify-center min-h-screen bg-gray-100">
      <div class="text-center max-w-md px-6">
        <Icon name="lucide:mail-x" class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 class="text-xl font-semibold mb-2">Email Not Available</h1>
        <p class="text-muted-foreground text-sm">{{ error }}</p>
      </div>
    </div>

    <iframe
      v-else
      ref="iframeRef"
      :srcdoc="htmlContent"
      class="w-full min-h-screen border-0"
      sandbox="allow-same-origin"
      title="Email content"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
});

const route = useRoute();
const emailId = Number(route.params.id);

const loading = ref(true);
const error = ref('');
const htmlContent = ref('');
const iframeRef = ref<HTMLIFrameElement>();

onMounted(async () => {
  try {
    const html = await $fetch(`/api/email/web-view/${emailId}`, {
      responseType: 'text',
    });
    htmlContent.value = html as string;
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'This email is no longer available.';
  } finally {
    loading.value = false;
  }
});
</script>
