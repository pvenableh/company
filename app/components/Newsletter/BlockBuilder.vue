<template>
  <div class="block-builder h-screen flex flex-col overflow-hidden">
    <!-- Top bar -->
    <div class="flex items-center justify-between px-3 py-2 border-b glass sticky top-0 z-10 gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <NuxtLink
          to="/email"
          class="rounded-full p-1.5 hover:bg-muted/50 text-muted-foreground hover:text-foreground ios-press transition-colors shrink-0"
        >
          <Icon name="lucide:arrow-left" class="w-3.5 h-3.5" />
        </NuxtLink>
        <h1 class="font-medium text-sm truncate">{{ template?.name || 'Template Builder' }}</h1>

        <!-- Save status indicator -->
        <Transition name="fade" mode="out-in">
          <span v-if="builder.saving.value" class="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            <Icon name="lucide:loader-2" class="w-3 h-3 animate-spin" />
            <span class="hidden sm:inline">Saving…</span>
          </span>
          <span v-else-if="justSaved" class="flex items-center gap-1 text-[10px] text-green-600 shrink-0">
            <Icon name="lucide:check" class="w-3 h-3" />
            <span class="hidden sm:inline">Saved</span>
          </span>
          <span v-else-if="builder.isDirty.value" class="flex items-center gap-1 text-[10px] text-amber-500 shrink-0">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span class="hidden sm:inline">Unsaved</span>
          </span>
        </Transition>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <!-- Block count -->
        <span v-if="builder.canvas.value.length" class="text-[10px] text-muted-foreground tabular-nums mr-1 hidden sm:inline">
          {{ builder.canvas.value.length }} {{ builder.canvas.value.length === 1 ? 'block' : 'blocks' }}
        </span>

        <!-- Sidebar toggle (mobile) -->
        <button class="lg:hidden rounded-full px-2.5 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1 transition-colors" @click="showSidebar = !showSidebar">
          <Icon name="lucide:layout-list" class="w-3 h-3" />
          <span class="hidden sm:inline">Blocks</span>
        </button>

        <!-- AI Generate -->
        <button
          class="rounded-full px-2.5 py-1.5 text-[11px] font-medium bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-400 ios-press inline-flex items-center gap-1 transition-colors"
          @click="showAIWizard = true"
        >
          <Icon name="lucide:sparkles" class="w-3 h-3" />
          <span class="hidden sm:inline">AI</span>
        </button>

        <!-- HTML dropdown -->
        <div class="relative" ref="importExportRef">
          <button
            class="rounded-full px-2.5 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1 transition-colors"
            @click="showImportExport = !showImportExport"
          >
            <Icon name="lucide:file-code-2" class="w-3 h-3" />
            <span class="hidden sm:inline">HTML</span>
            <Icon name="lucide:chevron-down" class="w-2.5 h-2.5" />
          </button>
          <Transition name="fade">
            <div
              v-if="showImportExport"
              class="absolute right-0 top-full mt-1.5 w-48 ios-card py-1 shadow-xl z-50"
            >
              <button
                class="flex items-center gap-2 w-full px-3 py-2 text-[11px] rounded-lg hover:bg-muted/50 transition-colors text-left"
                @click="showImportExport = false; showPasteModal = true"
              >
                <Icon name="lucide:clipboard-paste" class="w-3.5 h-3.5 text-muted-foreground" />
                Paste HTML / MJML
              </button>
              <button
                class="flex items-center gap-2 w-full px-3 py-2 text-[11px] rounded-lg hover:bg-muted/50 transition-colors text-left"
                :disabled="!builder.previewHtml.value"
                :class="{ 'opacity-40 cursor-not-allowed': !builder.previewHtml.value }"
                @click="showImportExport = false; copyHtmlToClipboard()"
              >
                <Icon name="lucide:copy" class="w-3.5 h-3.5 text-muted-foreground" />
                Copy HTML
              </button>
              <button
                class="flex items-center gap-2 w-full px-3 py-2 text-[11px] rounded-lg hover:bg-muted/50 transition-colors text-left"
                :disabled="!builder.previewHtml.value"
                :class="{ 'opacity-40 cursor-not-allowed': !builder.previewHtml.value }"
                @click="showImportExport = false; downloadHtml()"
              >
                <Icon name="lucide:download" class="w-3.5 h-3.5 text-muted-foreground" />
                Download HTML
              </button>
              <button
                class="flex items-center gap-2 w-full px-3 py-2 text-[11px] rounded-lg hover:bg-muted/50 transition-colors text-left"
                @click="showImportExport = false; copyMjmlToClipboard()"
              >
                <Icon name="lucide:braces" class="w-3.5 h-3.5 text-muted-foreground" />
                Copy MJML
              </button>
            </div>
          </Transition>
        </div>

        <!-- Divider -->
        <div class="w-px h-5 bg-border/60 mx-0.5 hidden sm:block" />

        <!-- Test -->
        <button class="rounded-full px-2.5 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1 transition-colors" @click="showTestModal = true">
          <Icon name="lucide:send" class="w-3 h-3" />
          <span class="hidden sm:inline">Test</span>
        </button>

        <!-- Preview -->
        <button class="rounded-full px-2.5 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1 transition-colors" @click="showPreview = !showPreview">
          <Icon :name="showPreview ? 'lucide:panel-right-close' : 'lucide:panel-right-open'" class="w-3 h-3" />
          <span class="hidden sm:inline">Preview</span>
        </button>

        <!-- Save -->
        <button
          class="rounded-full px-2.5 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press inline-flex items-center gap-1 shadow-sm transition-colors disabled:opacity-40"
          :disabled="builder.saving.value || !builder.isDirty.value"
          @click="handleSave"
        >
          <Icon name="lucide:save" class="w-3 h-3" />
          <span class="hidden sm:inline">Save</span>
        </button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden relative">
      <!-- Sidebar backdrop (mobile) -->
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
            lg:shadow-none
          "
          :class="{ 'top-0 glass': !isLg }"
        >
          <!-- Mobile sidebar header -->
          <div class="flex items-center justify-between px-3 py-2 border-b lg:hidden">
            <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Block Library</span>
            <button class="p-1 rounded-full hover:bg-muted ios-press" @click="showSidebar = false">
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
              class="w-full flex items-center justify-center gap-1.5 rounded-full border border-dashed border-primary/30 px-3 py-2 text-[11px] font-medium text-primary hover:bg-primary/5 hover:border-primary/50 ios-press transition-all"
              @click="showCustomBlockModal = true"
            >
              <Icon name="lucide:code-2" class="w-3.5 h-3.5" />
              Custom MJML Block
            </button>
          </div>

          <!-- Partial Toggles -->
          <div class="border-t p-3 space-y-2 bg-muted/20">
            <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Email Sections</p>

            <div class="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                :checked="builder.includeWebVersionBar.value"
                class="rounded border-border h-3.5 w-3.5 cursor-pointer"
                @change="handlePartialToggle('web_version_bar', ($event.target as HTMLInputElement).checked)"
              />
              <span class="flex-1 cursor-pointer text-[11px]" @click="builder.includeWebVersionBar.value = !builder.includeWebVersionBar.value; handlePartialToggle('web_version_bar', builder.includeWebVersionBar.value)">Web version bar</span>
            </div>

            <div class="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                :checked="builder.includeHeader.value"
                class="rounded border-border h-3.5 w-3.5 cursor-pointer"
                @change="handlePartialToggle('header', ($event.target as HTMLInputElement).checked)"
              />
              <span class="flex-1 text-[11px]">Header</span>
              <button
                v-if="builder.headerPartial.value"
                class="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                @click="editingPartialType = 'header'"
              >
                <Icon name="lucide:pencil" class="w-3 h-3" /> Edit
              </button>
            </div>

            <div class="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                :checked="builder.includeFooter.value"
                class="rounded border-border h-3.5 w-3.5 cursor-pointer"
                @change="handlePartialToggle('footer', ($event.target as HTMLInputElement).checked)"
              />
              <span class="flex-1 text-[11px]">Footer</span>
              <button
                v-if="builder.footerPartial.value"
                class="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                @click="editingPartialType = 'footer'"
              >
                <Icon name="lucide:pencil" class="w-3 h-3" /> Edit
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Canvas -->
      <div class="flex-1 overflow-y-auto bg-muted/10 p-3 sm:p-6">
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

          <!-- Raw MJML fallback: template has source but no blocks yet -->
          <div v-else-if="builder.rawMjmlSource.value" class="py-6 sm:py-10">
            <div class="ios-card p-5 max-w-lg mx-auto text-center">
              <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3 mx-auto">
                <Icon name="lucide:layout-template" class="w-5 h-5 text-emerald-500" />
              </div>
              <h3 class="text-sm font-semibold text-foreground mb-1">Seeded from a template</h3>
              <p class="text-[11px] text-muted-foreground leading-relaxed mb-4">
                This starter ships as a complete MJML document. The preview on the right renders the original design. To edit, paste a revised MJML, replace with blocks, or add blocks alongside it.
              </p>
              <div class="flex gap-2 justify-center">
                <button
                  class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors"
                  @click="showPasteModal = true"
                >
                  <Icon name="lucide:clipboard-paste" class="w-3 h-3" /> Edit MJML
                </button>
                <button
                  class="rounded-full px-3 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press inline-flex items-center gap-1.5 shadow-sm transition-colors"
                  @click="showSidebar = true"
                >
                  <Icon name="lucide:blocks" class="w-3 h-3" /> Add blocks
                </button>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else class="py-8 sm:py-16">
            <div class="text-center mb-8">
              <h2 class="text-lg font-medium text-foreground mb-1">How would you like to start?</h2>
              <p class="text-xs text-muted-foreground">Choose a starting point for your email</p>
            </div>

            <div class="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto">
              <!-- AI Generate -->
              <button
                class="ios-card p-5 cursor-pointer group text-center bg-violet-50/30 dark:bg-violet-900/10 hover:shadow-md transition-all"
                @click="showAIWizard = true"
              >
                <div class="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-3 mx-auto group-hover:scale-105 transition-transform">
                  <Icon name="lucide:sparkles" class="w-5 h-5 text-violet-500" />
                </div>
                <h3 class="text-sm font-semibold text-foreground mb-0.5">Start with AI</h3>
                <p class="text-[10px] text-muted-foreground leading-relaxed">
                  Describe your email and AI generates layout and content
                </p>
                <span class="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                  Recommended <Icon name="lucide:arrow-right" class="w-2.5 h-2.5" />
                </span>
              </button>

              <!-- Manual -->
              <button
                class="ios-card p-5 cursor-pointer group text-center hover:shadow-md transition-all"
                @click="showSidebar = true"
              >
                <div class="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3 mx-auto group-hover:bg-primary/10 transition-colors">
                  <Icon name="lucide:layout-template" class="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 class="text-sm font-semibold text-foreground mb-0.5">Build Manually</h3>
                <p class="text-[10px] text-muted-foreground leading-relaxed">
                  Drag and drop blocks from the library
                </p>
                <span class="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Icon name="lucide:grip-vertical" class="w-2.5 h-2.5" /> Drag & drop
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
          <div class="flex items-center justify-between px-3 py-2 border-b lg:hidden">
            <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preview</span>
            <button class="p-1 rounded-full hover:bg-muted ios-press" @click="showPreview = false">
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

    <!-- Paste HTML/MJML Modal -->
    <Teleport to="body">
      <div
        v-if="showPasteModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
        @click.self="showPasteModal = false"
      >
        <div class="ios-card w-full max-w-2xl mx-4 shadow-xl overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border/30">
            <h3 class="text-sm font-semibold">Paste HTML or MJML</h3>
            <button class="p-1.5 rounded-full hover:bg-muted ios-press" @click="showPasteModal = false">
              <Icon name="lucide:x" class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="px-5 py-4">
            <p class="text-[11px] text-muted-foreground mb-3">
              Paste generated HTML from an MJML app or any email HTML. This will replace the current template source.
            </p>
            <textarea
              v-model="pastedHtmlContent"
              rows="12"
              placeholder="Paste your HTML or MJML here..."
              class="w-full rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y"
            />
          </div>
          <div class="flex items-center justify-between px-5 py-3 border-t border-border/30">
            <span class="text-[10px] text-muted-foreground">
              {{ pastedHtmlContent.includes('<mjml') ? 'Detected: MJML' : pastedHtmlContent.includes('<html') || pastedHtmlContent.includes('<table') ? 'Detected: HTML' : 'Paste content above' }}
            </span>
            <div class="flex gap-2">
              <button class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors" @click="showPasteModal = false">Cancel</button>
              <button
                class="rounded-full px-3 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1 disabled:opacity-40"
                :disabled="!pastedHtmlContent.trim()"
                @click="handlePasteImport"
              >
                <Icon name="lucide:check" class="w-3 h-3" /> Import
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn, useMediaQuery } from '@vueuse/core';
import type { CanvasBlock, NewsletterBlock } from '~~/shared/email/blocks';
import { nanoid } from 'nanoid';
import { parseVariablesSchema } from '~~/shared/email/blocks';

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
const showImportExport = ref(false);
const showPasteModal = ref(false);
const pastedHtmlContent = ref('');
const importExportRef = ref<HTMLElement | null>(null);
const copyFeedback = ref('');

const debouncedPreview = useDebounceFn(() => builder.refreshPreview(), 600);

onMounted(async () => {
  blockLibrary.value = await getBlockLibrary();
  await builder.loadBlocks();
  if (builder.canvas.value.length > 0 || builder.rawMjmlSource.value) {
    await builder.refreshPreview();
  } else if (props.autoOpenAi) {
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
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (builder.isDirty.value) handleSave();
  }
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

  const next = [
    ...builder.canvas.value.slice(0, idx + 1),
    duplicate,
    ...builder.canvas.value.slice(idx + 1),
  ];
  next.forEach((b, i) => (b.sort = i));
  builder.canvas.value = next;
  builder.isDirty.value = true;
  debouncedPreview();
}

function handleReorder(newOrder: CanvasBlock[]) {
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
  builder.addBlock(block);
  debouncedPreview();
  blockLibrary.value = await getBlockLibrary();
}

async function handleAIApply(result: { subject: string; previewText: string; sections: any[] }) {
  showAIWizard.value = false;
  builder.populateFromAI(result.sections, blockLibrary.value);
  showPreview.value = true;
  await builder.refreshPreview();
}

// ── HTML Import/Export ─────────────────────────────────────────────
async function handlePasteImport() {
  const content = pastedHtmlContent.value.trim();
  if (!content) return;

  const isMjml = content.includes('<mjml');

  if (isMjml) {
    const emailTemplateItems = useDirectusItems('email_templates');
    await emailTemplateItems.update(props.templateId, {
      mjml_source: content,
      mjml_assembled_at: new Date().toISOString(),
    });
    await builder.loadBlocks();
    await builder.refreshPreview();
  } else {
    const wrappedMjml = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
      <mj-text font-size="15px" color="#333333" line-height="1.7" />
      <mj-section padding="0" />
    </mj-attributes>
  </mj-head>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-raw>${content}</mj-raw>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
    const emailTemplateItems = useDirectusItems('email_templates');
    await emailTemplateItems.update(props.templateId, {
      mjml_source: wrappedMjml,
      mjml_assembled_at: new Date().toISOString(),
    });
    await builder.loadBlocks();
    await builder.refreshPreview();
  }

  showPasteModal.value = false;
  pastedHtmlContent.value = '';
}

async function copyHtmlToClipboard() {
  if (!builder.previewHtml.value) return;
  try {
    await navigator.clipboard.writeText(builder.previewHtml.value);
    copyFeedback.value = 'html';
    setTimeout(() => { copyFeedback.value = ''; }, 2000);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = builder.previewHtml.value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

async function copyMjmlToClipboard() {
  const mjml = builder.assembleMjml();
  try {
    await navigator.clipboard.writeText(mjml);
    copyFeedback.value = 'mjml';
    setTimeout(() => { copyFeedback.value = ''; }, 2000);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = mjml;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function downloadHtml() {
  if (!builder.previewHtml.value) return;
  const blob = new Blob([builder.previewHtml.value], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.template?.name || 'email-template'}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Close import/export dropdown on outside click
onMounted(() => {
  const handler = (e: MouseEvent) => {
    if (showImportExport.value && importExportRef.value && !importExportRef.value.contains(e.target as Node)) {
      showImportExport.value = false;
    }
  };
  document.addEventListener('click', handler);
  onUnmounted(() => document.removeEventListener('click', handler));
});
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
