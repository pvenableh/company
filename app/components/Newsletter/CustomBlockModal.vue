<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="$emit('close')">
    <div class="bg-background rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="lucide:code-2" class="w-4 h-4 text-primary" />
          </div>
          <h3 class="font-semibold text-sm">Custom MJML Block</h3>
        </div>
        <button class="text-muted-foreground hover:text-foreground transition-colors" @click="$emit('close')">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <!-- Block info -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-xs font-medium">Block Name <span class="text-destructive">*</span></label>
            <input
              v-model="name"
              type="text"
              placeholder="My Custom Block"
              class="w-full rounded-md border px-3 py-2 text-sm bg-background"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium">Category</label>
            <select
              v-model="category"
              class="w-full rounded-md border px-3 py-2 text-sm bg-background"
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
          <label class="text-xs font-medium">Description</label>
          <input
            v-model="description"
            type="text"
            placeholder="A brief description of what this block does"
            class="w-full rounded-md border px-3 py-2 text-sm bg-background"
          />
        </div>

        <!-- MJML Code -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium">
              MJML Code <span class="text-destructive">*</span>
            </label>
            <div class="flex items-center gap-2">
              <button
                class="text-[11px] text-primary hover:underline"
                @click="insertTemplate('section')"
              >
                + Section
              </button>
              <button
                class="text-[11px] text-primary hover:underline"
                @click="insertTemplate('two-column')"
              >
                + Two Column
              </button>
              <button
                class="text-[11px] text-primary hover:underline"
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
              class="w-full rounded-md border px-3 py-2.5 text-xs bg-background font-mono resize-y leading-relaxed"
              placeholder="<mj-section>
  <mj-column>
    <mj-text>Your content here</mj-text>
  </mj-column>
</mj-section>"
              spellcheck="false"
            />
            <!-- Line count indicator -->
            <div class="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 tabular-nums">
              {{ mjmlSource.split('\n').length }} lines
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground">
            Write MJML section content (no &lt;mjml&gt; or &lt;mj-body&gt; wrapper needed).
            Use <code class="bg-muted px-1 rounded text-[10px]" v-text="'{{{ variable_name }}}'"></code> for configurable values.
          </p>
        </div>

        <!-- Variables (auto-detected) -->
        <div v-if="detectedVariables.length" class="space-y-2">
          <div class="flex items-center gap-2">
            <label class="text-xs font-medium">Detected Variables</label>
            <span class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {{ detectedVariables.length }}
            </span>
          </div>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <div
              v-for="variable in variableDefinitions"
              :key="variable.key"
              class="flex items-center gap-2 bg-muted/30 rounded-md px-3 py-2"
            >
              <code class="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded min-w-[80px]">
                {{ variable.key }}
              </code>
              <input
                v-model="variable.label"
                type="text"
                placeholder="Label"
                class="flex-1 rounded border px-2 py-1 text-xs bg-background"
              />
              <select
                v-model="variable.type"
                class="rounded border px-2 py-1 text-xs bg-background w-24"
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
                class="w-24 rounded border px-2 py-1 text-xs bg-background"
              />
            </div>
          </div>
        </div>

        <!-- Validation errors -->
        <div v-if="validationError" class="rounded-md px-3 py-2 bg-destructive/10 text-destructive text-xs">
          {{ validationError }}
        </div>

        <!-- Preview -->
        <div v-if="previewHtml" class="space-y-1.5">
          <label class="text-xs font-medium">Preview</label>
          <div class="rounded-md border overflow-hidden bg-white">
            <iframe
              ref="previewRef"
              style="width: 100%; min-height: 200px; border: none"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between px-5 py-3 border-t shrink-0">
        <Button variant="outline" size="sm" :disabled="!mjmlSource.trim()" @click="handlePreview">
          <Icon name="lucide:eye" class="w-3.5 h-3.5 mr-1" />
          Preview
        </Button>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="$emit('close')">Cancel</Button>
          <Button
            size="sm"
            :disabled="!canSave || saving"
            @click="handleSave"
          >
            <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
            {{ saving ? 'Creating…' : saveToLibrary ? 'Save to Library & Add' : 'Add to Canvas' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
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

// Auto-detect {{{variable}}} patterns in MJML code
const detectedVariables = computed(() => {
  const matches = mjmlSource.value.match(/\{\{\{([^}]+)\}\}\}/g);
  if (!matches) return [];
  const unique = [...new Set(matches.map((m) => m.replace(/\{\{\{|\}\}\}/g, '')))];
  return unique;
});

// Build variable definitions reactively
const variableDefinitions = ref<(BlockVariableDefinition & { default: string })[]>([]);

watch(detectedVariables, (vars) => {
  const existing = new Map(variableDefinitions.value.map((v) => [v.key, v]));
  variableDefinitions.value = vars.map((key) => {
    if (existing.has(key)) return existing.get(key)!;
    // Smart type guessing from the variable name
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

// MJML starter templates
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
    // Wrap in MJML structure for preview
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

    // Write to iframe
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
    // Build the slug from the name
    const slug = name.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Build variables schema
    const variablesSchema = variableDefinitions.value.length
      ? variableDefinitions.value.map((v) => ({
          key: v.key,
          label: v.label,
          type: v.type,
          default: v.default || undefined,
        }))
      : [];

    if (saveToLibrary.value) {
      // Save to Directus as a new newsletter block
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
      // Create a transient block (not saved to DB)
      const block: NewsletterBlock = {
        id: -Date.now(), // Negative ID for transient blocks
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
