<template>
  <div class="block-builder h-screen flex flex-col overflow-hidden">
    <!-- Top bar -->
    <div class="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/email"
          class="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          <Icon name="lucide:arrow-left" class="w-4 h-4 inline mr-1" />
          Email
        </NuxtLink>
        <span class="text-muted-foreground/30">|</span>
        <h1 class="font-semibold text-sm">{{ template?.name || 'Template Builder' }}</h1>

        <!-- Save status indicator -->
        <Transition name="fade" mode="out-in">
          <span v-if="builder.saving.value" class="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="lucide:loader-2" class="w-3 h-3 animate-spin" />
            Saving…
          </span>
          <span v-else-if="justSaved" class="flex items-center gap-1 text-xs text-green-600">
            <Icon name="lucide:check" class="w-3 h-3" />
            Saved
          </span>
          <span v-else-if="builder.isDirty.value" class="flex items-center gap-1 text-xs text-amber-500">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Unsaved
          </span>
        </Transition>
      </div>

      <div class="flex items-center gap-2">
        <!-- Block count -->
        <span v-if="builder.canvas.value.length" class="text-[11px] text-muted-foreground tabular-nums mr-1">
          {{ builder.canvas.value.length }} {{ builder.canvas.value.length === 1 ? 'block' : 'blocks' }}
        </span>

        <Button variant="ghost" size="sm" @click="showTestModal = true">
          <Icon name="lucide:send" class="w-3.5 h-3.5 mr-1" />
          Send Test
        </Button>
        <Button variant="outline" size="sm" @click="showPreview = !showPreview">
          <Icon :name="showPreview ? 'lucide:panel-right-close' : 'lucide:panel-right-open'" class="w-3.5 h-3.5 mr-1" />
          Preview
        </Button>
        <Button size="sm" :disabled="builder.saving.value || !builder.isDirty.value" @click="handleSave">
          <Icon name="lucide:save" class="w-3.5 h-3.5 mr-1" />
          Save
        </Button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden">
      <!-- Block Library Sidebar -->
      <div class="w-64 shrink-0 border-r overflow-y-auto flex flex-col bg-background">
        <NewsletterBlockLibrarySidebar
          :library="blockLibrary"
          class="flex-1"
          @add-block="handleAddBlock($event)"
        />

        <!-- Custom Block Button -->
        <div class="border-t p-3">
          <button
            class="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 hover:border-primary/50 transition-all"
            @click="showCustomBlockModal = true"
          >
            <Icon name="lucide:code-2" class="w-3.5 h-3.5" />
            Custom MJML Block
          </button>
        </div>

        <!-- Partial Toggles + Edit -->
        <div class="border-t p-3 space-y-2 bg-muted/30">
          <p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email Sections</p>

          <!-- Web version bar -->
          <div class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              :checked="builder.includeWebVersionBar.value"
              class="rounded border-border h-3.5 w-3.5 cursor-pointer"
              @change="handlePartialToggle('web_version_bar', ($event.target as HTMLInputElement).checked)"
            />
            <span class="flex-1 cursor-pointer" @click="builder.includeWebVersionBar.value = !builder.includeWebVersionBar.value; handlePartialToggle('web_version_bar', builder.includeWebVersionBar.value)">Web version bar</span>
          </div>

          <!-- Header -->
          <div class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              :checked="builder.includeHeader.value"
              class="rounded border-border h-3.5 w-3.5 cursor-pointer"
              @change="handlePartialToggle('header', ($event.target as HTMLInputElement).checked)"
            />
            <span class="flex-1">Header</span>
            <button
              v-if="builder.headerPartial.value"
              class="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              title="Edit header variables (logo, colors, etc.)"
              @click="editingPartialType = 'header'"
            >
              <Icon name="lucide:pencil" class="w-3 h-3" />
              Edit
            </button>
          </div>

          <!-- Footer -->
          <div class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              :checked="builder.includeFooter.value"
              class="rounded border-border h-3.5 w-3.5 cursor-pointer"
              @change="handlePartialToggle('footer', ($event.target as HTMLInputElement).checked)"
            />
            <span class="flex-1">Footer</span>
            <button
              v-if="builder.footerPartial.value"
              class="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              title="Edit footer variables (address, links, etc.)"
              @click="editingPartialType = 'footer'"
            >
              <Icon name="lucide:pencil" class="w-3 h-3" />
              Edit
            </button>
          </div>
        </div>
      </div>

      <!-- Canvas -->
      <div class="flex-1 overflow-y-auto bg-muted/20 p-6">
        <div class="max-w-2xl mx-auto">
          <NewsletterBuilderCanvas
            v-if="builder.canvas.value.length"
            :blocks="builder.canvas.value"
            @remove="handleRemoveBlock($event)"
            @move="builder.moveBlock($event.id, $event.direction); debouncedPreview()"
            @duplicate="handleDuplicateBlock($event)"
            @update-vars="handleVarsUpdate($event)"
            @reorder="handleReorder($event)"
          />

          <!-- Empty state -->
          <div
            v-else
            class="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed rounded-xl bg-background/50"
          >
            <div class="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
              <Icon name="lucide:layout-template" class="w-8 h-8 text-primary/40" />
            </div>
            <p class="text-base font-medium text-foreground mb-1">Start building your email</p>
            <p class="text-sm max-w-xs text-center">
              Choose blocks from the library on the left to build your email template
            </p>
            <div class="flex items-center gap-1 mt-4 text-xs text-muted-foreground/60">
              <Icon name="lucide:grip-vertical" class="w-3 h-3" />
              <span>Drag blocks to reorder</span>
              <span class="mx-1">•</span>
              <Icon name="lucide:settings-2" class="w-3 h-3" />
              <span>Click gear to customize</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Preview Pane — flexible width, grows to show 600px email + padding -->
      <Transition name="slide-right">
        <NewsletterTemplatePreviewPane
          v-if="showPreview"
          :html="builder.previewHtml.value"
          :errors="builder.previewErrors.value"
          class="w-[680px] shrink-0 border-l"
        />
      </Transition>
    </div>

    <!-- Send Test Modal -->
    <NewsletterSendTestModal
      v-if="showTestModal"
      :template-id="templateId"
      @close="showTestModal = false"
    />

    <!-- Custom MJML Block Modal -->
    <NewsletterCustomBlockModal
      v-if="showCustomBlockModal"
      @close="showCustomBlockModal = false"
      @add-block="handleCustomBlockCreated($event)"
    />

    <!-- Partial Editor Modal -->
    <NewsletterPartialEditor
      v-if="editingPartialType"
      :type="editingPartialType"
      :partial="editingPartialType === 'header' ? builder.headerPartial.value : builder.footerPartial.value"
      :builder="builder"
      @close="editingPartialType = null"
      @saved="debouncedPreview()"
    />
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';
import type { CanvasBlock, NewsletterBlock } from '~/types/email/blocks';
import { nanoid } from 'nanoid';
import { parseVariablesSchema } from '~/types/email/blocks';

const props = defineProps<{
  templateId: number;
  template?: any;
}>();

const { getBlockLibrary } = useNewsletterBlocks();
const builder = useTemplateBuilder(toRef(props, 'templateId'));

const blockLibrary = ref<Record<string, any>>({});
const showPreview = ref(true);
const showTestModal = ref(false);
const showCustomBlockModal = ref(false);
const editingPartialType = ref<'header' | 'footer' | 'web_version_bar' | null>(null);
const justSaved = ref(false);

const debouncedPreview = useDebounceFn(() => builder.refreshPreview(), 600);

onMounted(async () => {
  blockLibrary.value = await getBlockLibrary();
  await builder.loadBlocks();
  if (builder.canvas.value.length > 0) await builder.refreshPreview();
});

// ── Keyboard shortcuts ────────────────────────────────────────────
onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

function handleKeydown(e: KeyboardEvent) {
  // Ctrl/Cmd+S = Save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (builder.isDirty.value) handleSave();
  }
  // Ctrl/Cmd+P = Toggle Preview
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    showPreview.value = !showPreview.value;
  }
}

// ── Block operations ──────────────────────────────────────────────
function handleAddBlock(block: NewsletterBlock) {
  builder.addBlock(block);
  debouncedPreview();
}

function handleRemoveBlock(instanceId: string) {
  builder.removeBlock(instanceId);
  debouncedPreview();
}

function handleDuplicateBlock(instanceId: string) {
  const original = builder.canvas.value.find((b) => b.instanceId === instanceId);
  if (!original) return;

  const idx = builder.canvas.value.indexOf(original);
  const duplicate: CanvasBlock = {
    instanceId: nanoid(8),
    blockId: original.blockId,
    block: original.block,
    variables: { ...original.variables },
    sort: idx + 1,
  };

  builder.canvas.value.splice(idx + 1, 0, duplicate);
  // Reindex sort order
  builder.canvas.value.forEach((b, i) => (b.sort = i));
  builder.isDirty.value = true;
  debouncedPreview();
}

function handleReorder(newOrder: CanvasBlock[]) {
  // Update the canvas with the new order
  builder.canvas.value.splice(0, builder.canvas.value.length, ...newOrder);
  builder.canvas.value.forEach((b, i) => (b.sort = i));
  builder.isDirty.value = true;
  debouncedPreview();
}

function handleVarsUpdate(payload: { id: string; vars: Record<string, any> }) {
  builder.updateBlockVariables(payload.id, payload.vars);
  debouncedPreview();
}

function handlePartialToggle(type: 'header' | 'footer' | 'web_version_bar', value: boolean) {
  builder.togglePartial(type, value);
  debouncedPreview();
}

async function handleSave() {
  await builder.save();
  await builder.refreshPreview();
  justSaved.value = true;
  setTimeout(() => { justSaved.value = false; }, 2500);
}

async function handleCustomBlockCreated(block: NewsletterBlock) {
  // Add the new block to the canvas
  builder.addBlock(block);
  debouncedPreview();
  // Refresh the block library so the new block appears in the sidebar
  blockLibrary.value = await getBlockLibrary();
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
