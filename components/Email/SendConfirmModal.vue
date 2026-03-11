<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="$emit('cancel')">
    <div class="bg-background rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b shrink-0">
        <h3 class="font-semibold text-sm">Review Before Sending</h3>
        <button class="text-muted-foreground hover:text-foreground" @click="$emit('cancel')">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <!-- Summary -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-xs text-muted-foreground">Template</p>
            <p class="text-sm font-medium">{{ templateName }}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Recipients</p>
            <p class="text-2xl font-bold">{{ recipientCount }}</p>
          </div>
          <div v-if="ccList?.length">
            <p class="text-xs text-muted-foreground">CC</p>
            <p class="text-sm">{{ ccList.join(', ') }}</p>
          </div>
        </div>

        <!-- Preview iframe -->
        <div class="border rounded-lg overflow-hidden" style="height: 400px">
          <iframe
            ref="previewFrame"
            style="width: 100%; height: 100%; border: none"
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      <div class="flex justify-end gap-2 px-5 py-3 border-t shrink-0">
        <Button variant="outline" @click="$emit('cancel')">Cancel</Button>
        <Button :disabled="sending" class="bg-green-600 hover:bg-green-700 text-white" @click="$emit('confirm')">
          {{ sending ? 'Sending…' : `Send to ${recipientCount} recipients` }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';

const props = defineProps<{
  templateName: string;
  recipientCount: number;
  previewHtml: string;
  ccList?: string[];
  sending?: boolean;
}>();

defineEmits<{ cancel: []; confirm: [] }>();

const previewFrame = ref<HTMLIFrameElement | null>(null);

watch(
  () => props.previewHtml,
  (html) => {
    if (!previewFrame.value || !html) return;
    const doc = previewFrame.value.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  },
  { immediate: true }
);
</script>
