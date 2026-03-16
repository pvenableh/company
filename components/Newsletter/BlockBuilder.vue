<template>
  <div class="block-builder h-screen flex flex-col overflow-hidden">
    <!-- Top bar -->
    <div class="flex items-center justify-between px-2 sm:px-4 py-2 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10 gap-2">
      <div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
        <NuxtLink
          to="/email"
          class="text-muted-foreground hover:text-foreground text-sm transition-colors shrink-0"
        >
          <Icon name="lucide:arrow-left" class="w-4 h-4 inline mr-1" />
          <span class="hidden sm:inline">Email</span>
        </NuxtLink>
        <span class="text-muted-foreground/30 hidden sm:inline">|</span>
        <h1 class="font-semibold text-sm truncate">{{ template?.name || 'Template Builder' }}</h1>

        <!-- Save status indicator -->
        <Transition name="fade" mode="out-in">
          <span v-if="builder.saving.value" class="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Icon name="lucide:loader-2" class="w-3 h-3 animate-spin" />
            <span class="hidden sm:inline">Saving…</span>
          </span>
          <span v-else-if="justSaved" class="flex items-center gap-1 text-xs text-green-600 shrink-0">
            <Icon name="lucide:check" class="w-3 h-3" />
            <span class="hidden sm:inline">Saved</span>
          </span>
          <span v-else-if="builder.isDirty.value" class="flex items-center gap-1 text-xs text-amber-500 shrink-0">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span class="hidden sm:inline">Unsaved</span>
          </span>
        </Transition>
      </div>

      <div class="flex items-center gap-1 sm:gap-2 shrink-0">
        <!-- Block count -->
        <span v-if="builder.canvas.value.length" class="text-[11px] text-muted-foreground tabular-nums mr-1 hidden sm:inline">
          {{ builder.canvas.value.length }} {{ builder.canvas.value.length === 1 ? 'block' : 'blocks' }}
        </span>

        <!-- Sidebar toggle (visible on < lg) -->
        <Button variant="ghost" size="sm" class="lg:hidden" @click="showSidebar = !showSidebar">
          <Icon name="lucide:layout-list" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline ml-1">Blocks</span>
        </Button>

        <!-- AI Generate button -->
        <Button
          variant="ghost"
          size="sm"
          class="text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20"
          @click="showAIWizard = true"
        >
          <Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline ml-1">AI Generate</span>
        </Button>

        <Button variant="ghost" size="sm" @click="showTestModal = true">
          <Icon name="lucide:send" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline ml-1">Send Test</span>
        </Button>
        <Button variant="outline" size="sm" @click="showPreview = !showPreview">
          <Icon :name="showPreview ? 'lucide:panel-right-close' : 'lucide:panel-right-open'" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline ml-1">Preview</span>
        </Button>
        <Button size="sm" :disabled="builder.saving.value || !builder.isDirty.value" @click="handleSave">
          <Icon name="lucide:save" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline ml-1">Save</span>
        </Button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden relative">
      <!-- Sidebar backdrop (visible on < lg when sidebar is open) -->
      <Transition name="fade">
        <div
          v-if="showSidebar"
          class="fixed inset-0 bg-black/20 z-20 lg:hidden"
          @click="showSidebar = false"
        />
      </Transition>

      <!-- Block Library Sidebar -->
      <Transition name="slide-left">
        <div
          v-if="showSidebar || isLg"
          class="
            w-64 shrink-0 border-r overflow-y-auto flex flex-col bg-background
            fixed inset-y-0 left-0 z-30 lg:relative lg:z-auto
            shadow-xl lg:shadow-none
          "
          :class="{ 'top-0': !isLg }"
        >
          <!-- Mobile sidebar header -->
          <div class="flex items-center justify-between px-3 py-2 border-b lg:hidden">
            <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Block Library</span>
            <button class="p-1 rounded hover:bg-muted" @click="showSidebar = false">
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>
          </div>

          <NewsletterBlockLibrarySidebar
            :library="blockLibrary"
            class="flex-1"
            @add-block="handleAddBlock($event); showSidebar = false"
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
      </Transition>

      <!-- Canvas -->
      <div class="flex-1 overflow-y-auto bg-muted/20 p-3 sm:p-6">
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

          <!-- Empty state — choose AI or manual -->
          <div v-else class="py-8 sm:py-16">
            <div class="text-center mb-8">
              <h2 class="text-lg font-semibold text-foreground mb-1">How would you like to start?</h2>
              <p class="text-sm text-muted-foreground">Choose a starting point for your email template</p>
            </div>

            <div class="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              <!-- AI Generate option (primary) -->
              <button
                class="group relative flex flex-col items-center text-center p-6 rounded-2xl border-2 border-violet-200 dark:border-violet-800/50 bg-gradient-to-b from-violet-50/80 to-white dark:from-violet-900/20 dark:to-background hover:border-violet-400 dark:hover:border-violet-600 hover:shadow-lg hover:shadow-violet-500/10 transition-all duration-300"
                @click="showAIWizard = true"
              >
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform">
                  <Icon name="lucide:sparkles" class="w-6 h-6 text-white" />
                </div>
                <h3 class="font-semibold text-foreground mb-1">Start with AI</h3>
                <p class="text-xs text-muted-foreground leading-relaxed">
                  Describe your email and AI will generate the layout, content, and images
                </p>
                <span class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
                  Recommended
                  <Icon name="lucide:arrow-right" class="w-3 h-3" />
                </span>
              </button>

              <!-- Manual build option -->
              <button
                class="group flex flex-col items-center text-center p-6 rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-background/50 hover:border-muted-foreground/40 hover:bg-muted/30 transition-all duration-300"
                @click="showSidebar = true"
              >
                <div class="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                  <Icon name="lucide:layout-template" class="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 class="font-semibold text-foreground mb-1">Build Manually</h3>
                <p class="text-xs text-muted-foreground leading-relaxed">
                  Drag and drop blocks from the library to create your layout
                </p>
                <span class="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Icon name="lucide:grip-vertical" class="w-3 h-3" />
                  Drag & drop
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Preview Pane -->
      <Transition name="slide-right">
        <div
          v-if="showPreview"
          class="
            fixed inset-0 z-20
            lg:relative lg:inset-auto lg:z-auto lg:w-[680px] lg:shrink-0 lg:border-l
            flex flex-col bg-background
          "
        >
          <!-- Mobile preview close bar -->
          <div class="flex items-center justify-between px-3 py-2 border-b lg:hidden">
            <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</span>
            <button class="p-1 rounded hover:bg-muted" @click="showPreview = false">
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>
          </div>
          <NewsletterTemplatePreviewPane
            :html="builder.previewHtml.value"
            :errors="builder.previewErrors.value"
            class="flex-1"
          />
        </div>
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

    <!-- AI Email Wizard -->
    <NewsletterAIEmailWizard
      v-if="showAIWizard"
      @close="showAIWizard = false"
      @apply="handleAIApply"
    />
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { useDebounceFn, useMediaQuery } from '@vueuse/core';
import type { CanvasBlock, NewsletterBlock } from '~/types/email/blocks';
import { nanoid } from 'nanoid';
import { parseVariablesSchema } from '~/types/email/blocks';

const props = defineProps<{
  templateId: number;
  template?: any;
  autoOpenAi?: boolean;
}>();

const { getBlockLibrary } = useNewsletterBlocks();
const builder = useTemplateBuilder(toRef(props, 'templateId'));

const isLg = useMediaQuery('(min-width: 1024px)');
const blockLibrary = ref<Record<string, any>>({});
const showPreview = ref(true);
const showSidebar = ref(false);
const showTestModal = ref(false);
const showCustomBlockModal = ref(false);
const showAIWizard = ref(false);
const editingPartialType = ref<'header' | 'footer' | 'web_version_bar' | null>(null);
const justSaved = ref(false);

const debouncedPreview = useDebounceFn(() => builder.refreshPreview(), 600);

onMounted(async () => {
  blockLibrary.value = await getBlockLibrary();
  await builder.loadBlocks();
  if (builder.canvas.value.length > 0) {
    await builder.refreshPreview();
  } else if (props.autoOpenAi) {
    // Auto-open AI wizard when coming from "Create & Generate"
    showAIWizard.value = true;
  }
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

async function handleAIApply(result: { subject: string; previewText: string; sections: any[] }) {
  showAIWizard.value = false;
  // Populate canvas from AI output
  builder.populateFromAI(result.sections, blockLibrary.value);
  // Auto-open preview to show the result
  showPreview.value = true;
  await builder.refreshPreview();
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

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.3s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

@media (min-width: 1024px) {
  .slide-left-enter-from,
  .slide-left-leave-to {
    transform: none;
    opacity: 1;
  }
}
</style>
