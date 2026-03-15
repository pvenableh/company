<template>
  <div class="flex flex-col h-full">
    <!-- Preview toolbar -->
    <div class="px-3 py-2 bg-muted/50 border-b flex items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Preview</span>

      <div class="flex items-center gap-1">
        <!-- Device switcher -->
        <div class="flex items-center bg-background rounded-md border p-0.5">
          <button
            v-for="device in devices"
            :key="device.key"
            class="flex items-center gap-1 px-2 py-1 rounded transition-all text-xs"
            :class="
              activeDevice === device.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            "
            :title="device.label + ' (' + device.width + ')'"
            @click="activeDevice = device.key"
          >
            <Icon :name="device.icon" class="w-3.5 h-3.5" />
            <span class="text-[10px] hidden lg:inline">{{ device.label }}</span>
          </button>
        </div>

        <!-- Zoom -->
        <div class="flex items-center bg-background rounded-md border p-0.5 ml-1">
          <button
            class="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Zoom out"
            :disabled="zoom <= 50"
            @click="zoom = Math.max(50, zoom - 10)"
          >
            <Icon name="lucide:minus" class="w-3 h-3" />
          </button>
          <span class="text-[10px] tabular-nums text-muted-foreground min-w-[32px] text-center">{{ zoom }}%</span>
          <button
            class="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Zoom in"
            :disabled="zoom >= 150"
            @click="zoom = Math.min(150, zoom + 10)"
          >
            <Icon name="lucide:plus" class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- MJML errors (collapsible) -->
    <div v-if="errors.length" class="border-b">
      <button
        class="w-full flex items-center justify-between px-3 py-1.5 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left"
        @click="showErrors = !showErrors"
      >
        <span class="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <Icon name="lucide:alert-triangle" class="w-3.5 h-3.5" />
          {{ errors.length }} {{ errors.length === 1 ? 'warning' : 'warnings' }}
        </span>
        <Icon
          :name="showErrors ? 'lucide:chevron-up' : 'lucide:chevron-down'"
          class="w-3.5 h-3.5 text-destructive/60"
        />
      </button>
      <Transition name="slide-down">
        <div v-if="showErrors" class="px-3 py-2 bg-destructive/5 space-y-1 max-h-32 overflow-y-auto">
          <p v-for="(e, i) in errors" :key="i" class="text-[11px] text-destructive font-mono leading-relaxed">
            {{ e }}
          </p>
        </div>
      </Transition>
    </div>

    <!-- Success indicator (no errors) -->
    <div v-else-if="html" class="px-3 py-1 bg-green-500/5 border-b flex items-center gap-1.5">
      <Icon name="lucide:check-circle-2" class="w-3 h-3 text-green-600" />
      <span class="text-[11px] text-green-700 font-medium">Valid MJML — no errors</span>
    </div>

    <!-- Iframe preview -->
    <div class="flex-1 overflow-auto flex items-start justify-center bg-muted/60 p-4">
      <div v-if="!html" class="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Icon name="lucide:eye-off" class="w-8 h-8 mb-2 opacity-40" />
        <p class="text-xs">Preview will appear here</p>
      </div>
      <div v-else class="relative" :style="{ width: deviceWidth, transition: 'width 0.3s ease' }">
        <!-- Device frame label -->
        <div class="text-center mb-2">
          <span class="text-[10px] text-muted-foreground/50 tabular-nums">{{ deviceWidthLabel }}</span>
        </div>
        <iframe
          ref="iframeRef"
          :style="{
            width: '100%',
            maxWidth: deviceWidth,
            border: 'none',
            background: '#ffffff',
            borderRadius: '8px',
            boxShadow: activeDevice === 'mobile'
              ? '0 0 0 8px #1a1a1a, 0 0 0 10px #333, 0 8px 30px rgba(0,0,0,0.2)'
              : '0 1px 3px rgba(0,0,0,0.1)',
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }"
          style="min-height: 600px; transition: all 0.3s ease"
          sandbox="allow-same-origin allow-scripts"
        />
      </div>
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
const showErrors = ref(true);
const zoom = ref(100);

const devices = [
  { key: 'desktop' as const, label: 'Desktop', icon: 'lucide:monitor', width: '600px' },
  { key: 'mobile' as const, label: 'Mobile', icon: 'lucide:smartphone', width: '375px' },
];

const deviceWidth = computed(() => {
  switch (activeDevice.value) {
    case 'mobile': return '375px';
    default: return '600px';
  }
});

const deviceWidthLabel = computed(() => {
  switch (activeDevice.value) {
    case 'mobile': return '375px — Mobile';
    default: return '600px — Desktop (Email Max Width)';
  }
});

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

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 200px;
  opacity: 1;
}
</style>
