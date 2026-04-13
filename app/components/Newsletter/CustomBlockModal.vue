<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="$emit('close')">
    <div class="ios-card w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border/30 shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon name="lucide:code-2" class="w-3.5 h-3.5 text-primary" />
          </div>
          <h3 class="text-sm font-semibold">Custom MJML Block</h3>
        </div>
        <button class="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ios-press transition-colors" @click="$emit('close')">
          <Icon name="lucide:x" class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <!-- Block info -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Block Name <span class="text-destructive">*</span></label>
            <input
              v-model="name"
              type="text"
              placeholder="My Custom Block"
              class="w-full rounded-xl border px-3 py-2 text-sm bg-background focus:ring-1 focus:ring-primary/30 outline-none transition-all"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Category</label>
            <select
              v-model="category"
              class="w-full rounded-xl border px-3 py-2 text-sm bg-background focus:ring-1 focus:ring-primary/30 outline-none transition-all"
            >
              <option value="content">Content</option>
              <option value="header">Header</option>
              <option value="hero">Hero</option>
              <option value="two-column">Two Column</option>
              <option value="three-column">Three Column</option>
              <option value="cta">Call to Action</option>
              <option value="image">Image</option>
              <option value="stats">Stats / Numbers</option>
              <option value="quote">Quote / Testimonial</option>
              <option value="list">List / Checklist</option>
              <option value="divider">Divider</option>
              <option value="social">Social Links</option>
              <option value="footer">Footer</option>
            </select>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
          <input
            v-model="description"
            type="text"
            placeholder="A brief description of what this block does"
            class="w-full rounded-xl border px-3 py-2 text-sm bg-background focus:ring-1 focus:ring-primary/30 outline-none transition-all"
          />
        </div>

        <!-- MJML Code -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              MJML Code <span class="text-destructive">*</span>
            </label>
            <div class="flex items-center gap-1">
              <button
                class="rounded-full px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/5 hover:bg-primary/10 ios-press transition-colors"
                @click="insertTemplate('section')"
              >
                + Section
              </button>
              <button
                class="rounded-full px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/5 hover:bg-primary/10 ios-press transition-colors"
                @click="insertTemplate('two-column')"
              >
                + Two Column
              </button>
              <button
                class="rounded-full px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/5 hover:bg-primary/10 ios-press transition-colors"
                @click="insertTemplate('image')"
              >
                + Image
              </button>
            </div>
          </div>
          <div class="relative">
            <textarea
              ref="codeRef"
              v-model="mjmlSource"
              rows="14"
              class="w-full rounded-xl border px-3 py-2.5 text-xs bg-background font-mono resize-y leading-relaxed focus:ring-1 focus:ring-primary/30 outline-none transition-all"
              placeholder="<mj-section>
  <mj-column>
    <mj-text>Your content here</mj-text>
  </mj-column>
</mj-section>"
              spellcheck="false"
            />
            <div class="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 tabular-nums">
              {{ mjmlSource.split('\n').length }} lines
            </div>
          </div>
          <p class="text-[10px] text-muted-foreground">
            Write MJML section content (no &lt;mjml&gt; wrapper needed).
            Use <code class="bg-muted px-1 rounded text-[10px]" v-text="'{{{ variable_name }}}'"></code> for configurable values.
          </p>
        </div>

        <!-- Variables (auto-detected) -->
        <div v-if="detectedVariables.length" class="space-y-2">
          <div class="flex items-center gap-2">
            <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Detected Variables</label>
            <span class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {{ detectedVariables.length }}
            </span>
          </div>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <div
              v-for="variable in variableDefinitions"
              :key="variable.key"
              class="flex items-center gap-2 bg-muted/20 rounded-xl px-3 py-2"
            >
              <code class="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-full min-w-[80px]">
                {{ variable.key }}
              </code>
              <input
                v-model="variable.label"
                type="text"
                placeholder="Label"
                class="flex-1 rounded-lg border px-2 py-1 text-xs bg-background"
              />
              <select
                v-model="variable.type"
                class="rounded-lg border px-2 py-1 text-xs bg-background w-24"
              >
                <option value="text">Text</option>
                <option value="color">Color</option>
                <option value="url">URL</option>
                <option value="image">Image</option>
                <option value="html">HTML</option>
                <option value="boolean">Boolean</option>
              </select>
              <input
                v-model="variable.default"
                type="text"
                placeholder="Default"
                class="w-24 rounded-lg border px-2 py-1 text-xs bg-background"
              />
            </div>
          </div>
        </div>

        <!-- Validation errors -->
        <div v-if="validationError" class="rounded-xl px-3 py-2 bg-destructive/10 text-destructive text-xs">
          {{ validationError }}
        </div>

        <!-- Preview -->
        <div v-if="previewHtml" class="space-y-1.5">
          <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Preview</label>
          <div class="rounded-xl border overflow-hidden bg-white">
            <iframe
              ref="previewRef"
              style="width: 100%; min-height: 200px; border: none"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between px-5 py-3 border-t border-border/30 shrink-0">
        <button
          class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1 disabled:opacity-40"
          :disabled="!mjmlSource.trim()"
          @click="handlePreview"
        >
          <Icon name="lucide:eye" class="w-3 h-3" />
          Preview
        </button>
        <div class="flex items-center gap-2">
          <button class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors" @click="$emit('close')">Cancel</button>
          <button
            class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors disabled:opacity-40 inline-flex items-center gap-1"
            :disabled="!canSave || saving"
            @click="handleSave"
          >
            <Icon name="lucide:plus" class="w-3 h-3" />
            {{ saving ? 'Creating…' : saveToLibrary ? 'Save & Add' : 'Add to Canvas' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NewsletterBlock, BlockCategory, BlockVariableDefinition } from '~~/shared/email/blocks';

const emit = defineEmits<{
  close: [];
  'add-block': [block: NewsletterBlock];
}>();

const { createBlock } = useNewsletterBlocks();
const { previewNewsletter } = useEmailTemplates();

const name = ref('');
const description = ref('');
const category = ref<BlockCategory>('content');
const mjmlSource = ref('');
const saving = ref(false);
const validationError = ref('');
const previewHtml = ref('');
const previewRef = ref<HTMLIFrameElement | null>(null);
const codeRef = ref<HTMLTextAreaElement | null>(null);
const saveToLibrary = ref(true);

const detectedVariables = computed(() => {
  const matches = mjmlSource.value.match(/\{\{\{([^}]+)\}\}\}/g);
  if (!matches) return [];
  const unique = [...new Set(matches.map((m) => m.replace(/\{\{\{|\}\}\}/g, '')))];
  return unique;
});

const variableDefinitions = ref<(BlockVariableDefinition & { default: string })[]>([]);

watch(detectedVariables, (vars) => {
  const existing = new Map(variableDefinitions.value.map((v) => [v.key, v]));
  variableDefinitions.value = vars.map((key) => {
    if (existing.has(key)) return existing.get(key)!;
    const lowerKey = key.toLowerCase();
    let type: BlockVariableDefinition['type'] = 'text';
    let defaultVal = '';
    if (lowerKey.includes('color') || lowerKey.includes('bg') || lowerKey.includes('background')) {
      type = 'color';
      defaultVal = 'transparent';
    } else if (lowerKey.includes('url') || lowerKey.includes('link') || lowerKey.includes('href')) {
      type = 'url';
    } else if (lowerKey.includes('image') || lowerKey.includes('img') || lowerKey.includes('src') || lowerKey.includes('logo')) {
      type = 'image';
    }
    return {
      key,
      label: key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      type,
      default: defaultVal,
    };
  });
});

const canSave = computed(() => {
  return name.value.trim() && mjmlSource.value.trim();
});

function insertTemplate(type: string) {
  const templates: Record<string, string> = {
    section: `<mj-section padding="20px">
  <mj-column>
    <mj-text font-size="16px" color="#333333" line-height="1.6">
      {{{content}}}
    </mj-text>
  </mj-column>
</mj-section>`,
    'two-column': `<mj-section padding="20px">
  <mj-column>
    <mj-text font-size="14px" color="#333333">
      {{{left_content}}}
    </mj-text>
  </mj-column>
  <mj-column>
    <mj-text font-size="14px" color="#333333">
      {{{right_content}}}
    </mj-text>
  </mj-column>
</mj-section>`,
    image: `<mj-section padding="0">
  <mj-column>
    <mj-image src="{{{image_url}}}" alt="{{{image_alt}}}" width="600px" />
  </mj-column>
</mj-section>`,
  };
  mjmlSource.value += (mjmlSource.value ? '\n' : '') + (templates[type] || '');
}

async function handlePreview() {
  validationError.value = '';
  try {
    const fullMjml = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
      <mj-text font-size="15px" color="#333333" line-height="1.7" />
      <mj-section padding="0" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f4f4f4">
${mjmlSource.value}
  </mj-body>
</mjml>`;

    const result = await previewNewsletter(fullMjml, {
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
    });

    previewHtml.value = result.html;

    if (result.errors?.length) {
      validationError.value = result.errors.join('\n');
    }

    nextTick(() => {
      if (previewRef.value && result.html) {
        const doc = previewRef.value.contentDocument;
        if (doc) {
          doc.open();
          doc.write(result.html);
          doc.close();
          nextTick(() => {
            if (previewRef.value?.contentDocument) {
              previewRef.value.style.height =
                (previewRef.value.contentDocument.documentElement.scrollHeight || 200) + 'px';
            }
          });
        }
      }
    });
  } catch (err: any) {
    validationError.value = err.message || 'Failed to preview MJML';
  }
}

async function handleSave() {
  if (!canSave.value) return;
  saving.value = true;
  validationError.value = '';

  try {
    const slug = name.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const variablesSchema = variableDefinitions.value.length
      ? variableDefinitions.value.map((v) => ({
          key: v.key,
          label: v.label,
          type: v.type,
          default: v.default || undefined,
        }))
      : [];

    if (saveToLibrary.value) {
      const block = await createBlock({
        name: name.value.trim(),
        slug,
        category: category.value,
        description: description.value.trim() || null,
        mjml_source: mjmlSource.value,
        variables_schema: variablesSchema as any,
        status: 'published',
      });

      emit('add-block', block);
    } else {
      const block: NewsletterBlock = {
        id: -Date.now(),
        slug,
        name: name.value.trim(),
        category: category.value,
        description: description.value.trim() || null,
        mjml_source: mjmlSource.value,
        variables_schema: variablesSchema,
        status: 'published',
      };
      emit('add-block', block);
    }

    emit('close');
  } catch (err: any) {
    validationError.value = err.message || 'Failed to create block';
  } finally {
    saving.value = false;
  }
}
</script>
