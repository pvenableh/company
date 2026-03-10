<template>
  <div class="block-builder h-screen flex flex-col overflow-hidden">
    <!-- Top bar -->
    <div class="flex items-center justify-between px-4 py-2 border-b bg-background">
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/admin/email/templates"
          class="text-muted-foreground hover:text-foreground text-sm"
        >
          <Icon name="lucide:arrow-left" class="w-4 h-4 inline mr-1" />
          Templates
        </NuxtLink>
        <span class="text-muted-foreground/40">|</span>
        <h1 class="font-semibold text-sm">{{ template?.name || 'Template Builder' }}</h1>
        <span v-if="builder.isDirty.value" class="text-xs text-amber-500">
          Unsaved changes
        </span>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" @click="showTestModal = true">
          <Icon name="lucide:send" class="w-3.5 h-3.5 mr-1" />
          Send Test
        </Button>
        <Button variant="outline" size="sm" @click="showPreview = !showPreview">
          <Icon name="lucide:eye" class="w-3.5 h-3.5 mr-1" />
          {{ showPreview ? 'Hide Preview' : 'Preview' }}
        </Button>
        <Button size="sm" :disabled="builder.saving.value" @click="handleSave">
          {{ builder.saving.value ? 'Saving…' : 'Save' }}
        </Button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden">
      <!-- Block Library Sidebar -->
      <BlockLibrarySidebar
        :library="blockLibrary"
        class="w-64 shrink-0 border-r overflow-y-auto"
        @add-block="builder.addBlock($event)"
      />

      <!-- Canvas -->
      <div class="flex-1 overflow-y-auto bg-muted/30 p-6">
        <BuilderCanvas
          v-if="builder.canvas.value.length"
          :blocks="builder.canvas.value"
          @remove="builder.removeBlock($event)"
          @move="builder.moveBlock($event.id, $event.direction)"
          @update-vars="handleVarsUpdate($event)"
        />
        <div
          v-else
          class="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg"
        >
          <Icon name="lucide:layout-template" class="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p class="text-lg mb-2">Start building your newsletter</p>
          <p class="text-sm">Add blocks from the library on the left</p>
        </div>
      </div>

      <!-- Preview Pane -->
      <TemplatePreviewPane
        v-if="showPreview"
        :html="builder.previewHtml.value"
        :errors="builder.previewErrors.value"
        class="w-96 shrink-0 border-l"
      />
    </div>

    <!-- Send Test Modal -->
    <SendTestModal
      v-if="showTestModal"
      :template-id="templateId"
      @close="showTestModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';

const props = defineProps<{
  templateId: number;
  template?: any;
}>();

const { getBlockLibrary } = useNewsletterBlocks();
const builder = useTemplateBuilder(toRef(props, 'templateId'));

const blockLibrary = ref<Record<string, any>>({});
const showPreview = ref(true);
const showTestModal = ref(false);

const debouncedPreview = useDebounceFn(() => builder.refreshPreview(), 600);

onMounted(async () => {
  blockLibrary.value = await getBlockLibrary();
  await builder.loadBlocks();
  if (builder.canvas.value.length > 0) await builder.refreshPreview();
});

function handleVarsUpdate(payload: { id: string; vars: Record<string, any> }) {
  builder.updateBlockVariables(payload.id, payload.vars);
  debouncedPreview();
}

async function handleSave() {
  await builder.save();
  await builder.refreshPreview();
}
</script>
