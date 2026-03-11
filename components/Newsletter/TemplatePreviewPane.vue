<template>
  <div class="flex flex-col h-full">
    <div class="px-3 py-2 bg-muted/50 border-b flex items-center justify-between">
      <span class="text-xs text-muted-foreground font-medium">Preview</span>
      <div class="flex items-center gap-1">
        <button
          v-for="device in devices"
          :key="device.key"
          class="p-1 rounded transition-colors"
          :class="
            activeDevice === device.key
              ? 'text-foreground bg-accent'
              : 'text-muted-foreground hover:text-foreground'
          "
          :title="device.label"
          @click="activeDevice = device.key"
        >
          <Icon :name="device.icon" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- MJML errors -->
    <div v-if="errors.length" class="px-3 py-2 bg-destructive/10 border-b">
      <p v-for="(e, i) in errors" :key="i" class="text-xs text-destructive">{{ e }}</p>
    </div>

    <!-- Iframe preview -->
    <div class="flex-1 overflow-auto flex items-start justify-center bg-muted p-4">
      <iframe
        ref="iframeRef"
        :style="{ width: deviceWidth, border: 'none', background: '#ffffff' }"
        style="min-height: 600px; transition: width 0.3s ease"
        sandbox="allow-same-origin"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  html: string;
  errors: string[];
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const activeDevice = ref<'desktop' | 'mobile'>('desktop');

const devices = [
  { key: 'desktop' as const, label: 'Desktop', icon: 'lucide:monitor' },
  { key: 'mobile' as const, label: 'Mobile', icon: 'lucide:smartphone' },
];

const deviceWidth = computed(() =>
  activeDevice.value === 'mobile' ? '375px' : '100%'
);

watch(
  () => props.html,
  (html) => {
    if (!iframeRef.value || !html) return;
    const doc = iframeRef.value.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      nextTick(() => {
        if (iframeRef.value?.contentDocument) {
          iframeRef.value.style.height =
            (iframeRef.value.contentDocument.documentElement.scrollHeight || 600) + 'px';
        }
      });
    }
  },
  { immediate: true }
);
</script>
