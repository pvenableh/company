<!--
  EmailSettingsPanel — slide-in side drawer inside the BlockBuilder.

  Exposes the per-template knobs the canvas would otherwise bake into the
  assembled MJML as hardcoded defaults: the email name (shown in the
  builder header + sender's saved templates list), the subject line, body
  background color, font family, base font size, and base text color.

  All edits flow through useTemplateBuilder so a Save in the header bar
  persists them alongside blocks. The composable falls back to the
  historical defaults whenever a field is left empty, so the surface is
  fully optional — power-users only need to touch the knobs they care to
  change.
-->
<script setup lang="ts">
import type { EmailDesignSettings } from '~~/shared/email/blocks';
import { DEFAULT_EMAIL_DESIGN } from '~~/shared/email/blocks';

const props = defineProps<{
  /**
   * templateName + subjectTemplate were edited here previously. Since
   * those are now inline in the BlockBuilder top bar they're accepted as
   * props (for backward-compat with the BlockBuilder's binding) but no
   * longer rendered or emitted from this drawer. The drawer is design-
   * tokens-only now.
   */
  templateName?: string;
  subjectTemplate?: string;
  designSettings: Required<EmailDesignSettings>;
}>();

void props.templateName;
void props.subjectTemplate;

const emit = defineEmits<{
  close: [];
  'update:design': [key: keyof EmailDesignSettings, value: string];
}>();

const FONT_OPTIONS = [
  { label: 'System Sans', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia (serif)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Courier (mono)', value: '"Courier New", Courier, monospace' },
];

const FONT_SIZES = ['13px', '14px', '15px', '16px', '17px', '18px', '20px'];

// Suspend the slide-over FocusScope trap while this drawer is mounted —
// otherwise inputs are unfocusable when the email template is itself
// open in the universal slide-over (EmailTemplatePanel).
const { suspend: suspendSlideOverTrap } = useSlideOverFocusTrapSuspend();
let releaseTrap: (() => void) | null = null;
onMounted(() => { releaseTrap = suspendSlideOverTrap(); });
onBeforeUnmount(() => { releaseTrap?.(); releaseTrap = null; });

function resetToDefault(key: keyof EmailDesignSettings) {
  emit('update:design', key, DEFAULT_EMAIL_DESIGN[key]);
}
</script>

<template>
  <Teleport to="body">
    <!-- z-[70] (NOT z-50) so the drawer lands ABOVE the AppSlideOverStack
         at z-60 when the email template is hosted inside EmailTemplatePanel.
         Same pattern as [[project_slide_over_stack_v2_1]]: dialogs over a
         slide-over need to clear the stack's z-index. -->
    <div
      class="fixed inset-0 z-[70] flex"
      @keydown.esc="emit('close')"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/30 backdrop-blur-sm" @click="emit('close')" />

      <!-- Drawer (right side) -->
      <div class="relative ml-auto w-full max-w-sm h-full bg-card border-l border-border shadow-2xl flex flex-col">
        <div class="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
          <div>
            <h3 class="text-sm font-semibold">Design</h3>
            <p class="text-[10px] text-muted-foreground mt-0.5">Background, type, and tokens applied to every block</p>
          </div>
          <button
            class="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ios-press transition-colors"
            @click="emit('close')"
          >
            <Icon name="lucide:x" class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <!-- Note: Template Name + Subject Line live in the BlockBuilder
               top bar now (the most-edited fields shouldn't need a drawer
               trip). This drawer is design tokens only. -->
          <p class="text-[10px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 leading-relaxed">
            Editing the <span class="font-medium text-foreground">subject</span> or
            <span class="font-medium text-foreground">name</span>? They're inline at the top of the editor.
          </p>

          <!-- Design tokens -->
          <section class="space-y-3">
            <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Design</p>

            <!-- Background color -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-[11px] font-medium text-muted-foreground">Body Background</label>
                <button
                  v-if="designSettings.body_background !== DEFAULT_EMAIL_DESIGN.body_background"
                  type="button"
                  class="text-[10px] text-primary hover:underline"
                  @click="resetToDefault('body_background')"
                >Reset</button>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  :value="designSettings.body_background"
                  class="h-9 w-12 rounded-lg border border-border bg-background cursor-pointer"
                  @input="emit('update:design', 'body_background', ($event.target as HTMLInputElement).value)"
                >
                <input
                  type="text"
                  :value="designSettings.body_background"
                  placeholder="#f4f4f4"
                  class="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                  @change="emit('update:design', 'body_background', ($event.target as HTMLInputElement).value)"
                >
              </div>
            </div>

            <!-- Text color -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-[11px] font-medium text-muted-foreground">Body Text Color</label>
                <button
                  v-if="designSettings.text_color !== DEFAULT_EMAIL_DESIGN.text_color"
                  type="button"
                  class="text-[10px] text-primary hover:underline"
                  @click="resetToDefault('text_color')"
                >Reset</button>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  :value="designSettings.text_color"
                  class="h-9 w-12 rounded-lg border border-border bg-background cursor-pointer"
                  @input="emit('update:design', 'text_color', ($event.target as HTMLInputElement).value)"
                >
                <input
                  type="text"
                  :value="designSettings.text_color"
                  placeholder="#333333"
                  class="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                  @change="emit('update:design', 'text_color', ($event.target as HTMLInputElement).value)"
                >
              </div>
            </div>

            <!-- Font family -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-[11px] font-medium text-muted-foreground">Font Family</label>
                <button
                  v-if="designSettings.font_family !== DEFAULT_EMAIL_DESIGN.font_family"
                  type="button"
                  class="text-[10px] text-primary hover:underline"
                  @click="resetToDefault('font_family')"
                >Reset</button>
              </div>
              <select
                :value="designSettings.font_family"
                class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                @change="emit('update:design', 'font_family', ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="f in FONT_OPTIONS" :key="f.label" :value="f.value">{{ f.label }}</option>
                <option v-if="!FONT_OPTIONS.some(f => f.value === designSettings.font_family)" :value="designSettings.font_family">
                  Custom — {{ designSettings.font_family.split(',')[0] }}
                </option>
              </select>
              <p class="text-[10px] text-muted-foreground mt-1">Email clients render the first installed family in the stack.</p>
            </div>

            <!-- Font size -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-[11px] font-medium text-muted-foreground">Body Font Size</label>
                <button
                  v-if="designSettings.font_size !== DEFAULT_EMAIL_DESIGN.font_size"
                  type="button"
                  class="text-[10px] text-primary hover:underline"
                  @click="resetToDefault('font_size')"
                >Reset</button>
              </div>
              <div class="bg-muted/40 rounded-full p-0.5 flex gap-0.5 overflow-x-auto">
                <button
                  v-for="size in FONT_SIZES"
                  :key="size"
                  type="button"
                  class="rounded-full px-3 py-1.5 text-[11px] font-medium transition-all whitespace-nowrap"
                  :class="designSettings.font_size === size ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
                  @click="emit('update:design', 'font_size', size)"
                >
                  {{ size }}
                </button>
              </div>
            </div>
          </section>

          <p class="text-[10px] text-muted-foreground border-t border-border/30 pt-3">
            Defaults apply to the overall <code class="font-mono">mj-body</code> background plus the base <code class="font-mono">mj-text</code> font / size / color. Individual blocks override per-block.
          </p>
        </div>

        <div class="px-5 py-3 border-t border-border/40 shrink-0 flex items-center justify-end">
          <button
            class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors"
            @click="emit('close')"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
