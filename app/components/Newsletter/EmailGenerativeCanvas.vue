<script setup lang="ts">
/**
 * <EmailGenerativeCanvas> — the Email builder wired to the Generative Canvas
 * kernel. Speak an email's intent ("win-back for clients who went quiet since
 * spring, warm not desperate") and Earnest assembles the newsletter block by
 * block — hero, story, one CTA — each rising into place, refined
 * conversationally. Nothing sends; "Save" creates an editable newsletter
 * template DRAFT you finish + send from the email builder.
 *
 * The block vocabulary is DYNAMIC: it's built from the org's real
 * `newsletter_blocks` library (loaded on mount) so the AI emits valid block
 * slugs with the right variable keys, and saving resolves each block back to a
 * `template_blocks` row with `instance_variables`.
 */
import { toast } from 'vue-sonner';
import { useGenerativeCanvas } from '~/composables/useGenerativeCanvas';
import { useCanvasChoreography } from '~/composables/useCanvasChoreography';
import { parseVariablesSchema, type NewsletterBlock } from '~~/shared/email/blocks';
import type { BlockKindSpec, CanvasBlock } from '~~/shared/canvas';

const props = defineProps<{
  brief?: string;
  entity?: { type: string; id: string };
  /**
   * Embedded mode: seed from the builder's current blocks and hand edited
   * blocks back via @apply (as AI "sections") instead of creating a new
   * template. The host builder owns persistence.
   */
  embedded?: boolean;
  /** Existing builder blocks to seed with: { id, slug, variables }. */
  initialBlocks?: { id?: string; slug: string; variables: Record<string, any> }[];
}>();

/** Emitted sections match useTemplateBuilder.populateFromAI's input shape. */
interface EmailSection { blockCategory: string; blockName: string; variables: Record<string, any> }
const emit = defineEmits<{
  (e: 'apply', sections: EmailSection[]): void;
  (e: 'close'): void;
}>();

// ── Load the real block library → dynamic AI vocabulary ──────────────────────
const { getBlocks } = useNewsletterBlocks();
const library = ref<NewsletterBlock[]>([]);
const libraryLoaded = ref(false);

const bySlug = computed(() => new Map(library.value.map((b) => [b.slug, b])));

/** Build one BlockKindSpec per library block so the AI emits valid slugs. */
const blockKinds = computed<BlockKindSpec[]>(() =>
  library.value.map((b) => {
    const vars = parseVariablesSchema(b.variables_schema, b.mjml_source);
    const keys = vars.map((v) => `${v.key}${v.type === 'color' ? ' (hex color)' : v.type === 'url' ? ' (url)' : v.type === 'image' ? ' (image url)' : ''}`).join(', ');
    return {
      kind: b.slug,
      label: b.name || b.slug,
      description: `${b.category || 'block'}${b.description ? ` — ${b.description}` : ''}. Fill real copy for its variables.`,
      shape: keys ? `data keys: { ${keys} }` : 'data: {}',
    };
  }),
);

onMounted(async () => {
  try {
    library.value = await getBlocks();
  } catch (e: any) {
    console.error('[EmailGenerativeCanvas] failed to load block library:', e?.message);
  } finally {
    libraryLoaded.value = true;
  }
});

const presence = useEarnestPresence({ initial: 'present' });
const canvasEl = ref<HTMLElement | null>(null);
const choreo = useCanvasChoreography(canvasEl, { stagger: 0.07, rise: 20, entrance: 'rise' });

const seededArtifact = props.embedded && props.initialBlocks?.length
  ? {
      blocks: props.initialBlocks.map((b, i) => ({
        id: b.id || `seed-${i}`,
        kind: b.slug,
        // Detach from the builder's reactive variables so edits stay local
        // until the user Applies.
        data: JSON.parse(JSON.stringify(b.variables ?? {})) as Record<string, any>,
      })),
    }
  : undefined;

const canvas = useGenerativeCanvas({
  canvasKind: 'email',
  blockKinds: () => blockKinds.value, // resolved at send time (library loads async)
  presence,
  choreography: choreo,
  brief: props.brief,
  entity: props.entity,
  initial: seededArtifact,
});

const { blocks, messages, isStreaming, isDrafting, lastNote, error, artifact } = canvas;

const title = computed({
  get: () => artifact.value.title ?? '',
  set: (v: string) => { artifact.value = { ...artifact.value, title: v }; },
});

// ── Intent field ─────────────────────────────────────────────────────────────
const intent = ref('');
const ready = computed(() => libraryLoaded.value && library.value.length > 0);
const SUGGESTIONS = [
  'A win-back email for clients who’ve gone quiet since spring — warm, not desperate, one clear CTA.',
  'A monthly newsletter: a hero, two short updates, and a booking CTA.',
  'A launch announcement for our new retainer service, with three feature cards.',
  'A simple thank-you email after a project wraps, with a referral ask.',
];

function submitIntent() {
  const text = intent.value.trim();
  if (!text || isStreaming.value || !ready.value) return;
  intent.value = '';
  canvas.sendIntent(text);
}
function runSuggestion(text: string) {
  if (isStreaming.value || !ready.value) return;
  canvas.sendIntent(text);
}
function onIntentKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitIntent(); }
}

// ── Block-card helpers ───────────────────────────────────────────────────────
function blockDef(block: CanvasBlock): NewsletterBlock | undefined {
  return bySlug.value.get(block.kind);
}
function blockName(block: CanvasBlock): string {
  return blockDef(block)?.name || block.kind;
}
function blockCategory(block: CanvasBlock): string {
  return blockDef(block)?.category || 'block';
}
const CATEGORY_TINT: Record<string, string> = {
  header: '#64748b', hero: '#7c3aed', content: '#2563eb', 'two-column': '#0891b2',
  'three-column': '#0d9488', cta: '#16a34a', image: '#d97706', stats: '#db2777',
  quote: '#9333ea', list: '#0284c7', divider: '#94a3b8', social: '#4f46e5', footer: '#475569',
};
function categoryTint(block: CanvasBlock): string {
  return CATEGORY_TINT[blockCategory(block)] || '#64748b';
}
/** Up to 3 human-ish text values from the block's data for a compact preview. */
function previewLines(block: CanvasBlock): string[] {
  const data = block.data || {};
  const out: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    if (/color|_bg$|url|href|image|logo|src/i.test(k)) continue; // skip non-copy vars
    // Some variables are HTML (type:'html'); show their text, not the markup.
    const text = v.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    out.push(text);
    if (out.length >= 3) break;
  }
  return out;
}

// ── Persist as a newsletter template draft ───────────────────────────────────
const { createTemplate, updateTemplate } = useEmailTemplates();
const templateBlockItems = useDirectusItems('template_blocks');
const router = useRouter();
const saving = ref(false);

async function saveDraft() {
  if (!blocks.value.length || saving.value) return;
  saving.value = true;
  try {
    const tpl = await createTemplate({
      name: title.value.trim() || 'Untitled email',
      type: 'newsletter',
      status: 'draft',
    });
    const templateId = (tpl as any).id;

    let sort = 0;
    for (const block of blocks.value) {
      const def = bySlug.value.get(block.kind);
      if (!def) continue; // skip any block the AI invented outside the library
      await templateBlockItems.create({
        template_id: templateId,
        block_id: def.id,
        sort: sort++,
        instance_variables: block.data && Object.keys(block.data).length ? block.data : null,
      });
    }
    await updateTemplate(templateId, { block_count: sort });

    presence.setMood('warm');
    presence.bump(0.7);
    toast.success('Email template draft created');
    router.push(`/email/templates/${templateId}`);
  } catch (e: any) {
    console.error('[EmailGenerativeCanvas] save failed:', e?.message);
    toast.error(e?.message || 'Could not create the email draft');
  } finally {
    saving.value = false;
  }
}

/** Leave the canvas — close the overlay (embedded) or go back (standalone). */
function exit() {
  if (props.embedded) { emit('close'); return; }
  if (import.meta.client && window.history.length > 1) router.back();
  else router.push('/email');
}

/** Embedded mode — hand blocks back to the builder as AI sections. */
function applyToHost() {
  if (!blocks.value.length) return;
  const sections: EmailSection[] = blocks.value
    .map((b) => {
      const def = bySlug.value.get(b.kind);
      if (!def) return null;
      return { blockCategory: def.category || 'content', blockName: def.name || def.slug, variables: b.data || {} };
    })
    .filter((s): s is EmailSection => !!s);
  if (!sections.length) return;
  presence.setMood('warm');
  presence.bump(0.6);
  emit('apply', sections);
}

const assistantLine = computed(() => {
  const last = [...messages.value].reverse().find((m) => m.role === 'assistant');
  return last?.content?.trim() || '';
});
</script>

<template>
  <div class="egc">
    <EarnestAura :presence="presence" class="egc__aura" />

    <div class="egc__inner">
      <header class="egc__head">
        <div class="egc__mark"><EarnestPresenceDot aperture /></div>
        <div class="egc__head-copy">
          <p class="egc__eyebrow">Draft an email with Earnest</p>
          <p class="egc__note">
            <span v-if="isDrafting" class="egc__note-live">Drafting…</span>
            <span v-else-if="assistantLine">{{ assistantLine }}</span>
            <span v-else-if="lastNote">{{ lastNote }}</span>
            <span v-else-if="!ready">Loading your block library…</span>
            <span v-else>Tell me the email’s job and audience — I’ll assemble it block by block.</span>
          </p>
        </div>
        <template v-if="blocks.length">
          <button v-if="embedded" class="egc__save" @click="applyToHost">Apply to email</button>
          <button v-else class="egc__save" :disabled="saving" @click="saveDraft">
            {{ saving ? 'Creating…' : 'Save as draft' }}
          </button>
        </template>
        <button class="egc__close" aria-label="Close" title="Close" @click="exit">
          <Icon name="lucide:x" />
        </button>
      </header>

      <input v-if="blocks.length && !embedded" v-model="title" class="egc__title" placeholder="Email name" />

      <div ref="canvasEl" class="egc__canvas">
        <TransitionGroup name="egc-fade" tag="div" class="egc__stack">
          <article
            v-for="block in blocks"
            :key="block.id"
            :data-canvas-block="block.id"
            class="egc__block"
          >
            <div class="egc__block-top">
              <span class="egc__cat" :style="{ '--tint': categoryTint(block) }">{{ blockCategory(block) }}</span>
              <span class="egc__bname">{{ blockName(block) }}</span>
            </div>
            <p v-for="(line, i) in previewLines(block)" :key="i" class="egc__line" :class="{ 'egc__line--lead': i === 0 }">
              {{ line }}
            </p>
            <p v-if="!previewLines(block).length" class="egc__line egc__line--muted">{{ blockName(block) }}</p>
          </article>
        </TransitionGroup>

        <div v-if="!blocks.length && !isDrafting" class="egc__empty">
          <p class="egc__empty-title">A blank email.</p>
          <p class="egc__empty-sub">Describe what this email needs to do and who it’s for — I’ll assemble the blocks, then we refine the copy together.</p>
          <div class="egc__suggestions">
            <button v-for="s in SUGGESTIONS" :key="s" class="egc__chip" :disabled="!ready" @click="runSuggestion(s)">{{ s }}</button>
          </div>
        </div>
      </div>

      <p v-if="error" class="egc__error">{{ error }}</p>

      <div class="egc__bar">
        <textarea
          v-model="intent"
          class="egc__input"
          rows="1"
          :placeholder="!ready ? 'Loading blocks…' : (blocks.length ? 'Refine — e.g. “make the CTA warmer” or “add a testimonial”' : 'What should this email do?')"
          :disabled="!ready"
          @focus="canvas.noteTyping()"
          @input="canvas.noteTyping()"
          @blur="canvas.noteRest()"
          @keydown="onIntentKeydown"
        />
        <button class="egc__send" :disabled="!intent.trim() || isStreaming || !ready" @click="submitIntent">
          <Icon :name="isStreaming ? 'lucide:loader-2' : 'lucide:arrow-up'" :class="{ 'egc__spin': isStreaming }" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.egc { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 100%; overflow: hidden; background: #0a1220; color: #e8eef7; border-radius: 1.25rem; }
.egc__aura { position: absolute; inset: 0; z-index: 0; opacity: 0.45; pointer-events: none; }
.egc__inner { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 0.85rem; height: 100%; padding: 1.25rem clamp(1rem, 3vw, 2rem); }
.egc__head { display: flex; align-items: center; gap: 0.85rem; }
.egc__mark { position: relative; width: 2.25rem; height: 2.25rem; flex: none; display: flex; align-items: center; justify-content: center; }
.egc__head-copy { flex: 1; min-width: 0; }
.egc__eyebrow { margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #7e93b0; }
.egc__note { margin: 0.15rem 0 0; font-size: 0.95rem; line-height: 1.45; color: #cdd8ea; max-width: 60ch; }
.egc__note-live { color: #9fb4d6; }
.egc__save { flex: none; border-radius: 9999px; padding: 0.5rem 1rem; font-size: 0.82rem; font-weight: 600; color: #06210f; background: linear-gradient(180deg, #6fe3a6, #3fbe82); border: none; cursor: pointer; transition: transform 0.15s ease, opacity 0.15s ease; }
.egc__save:hover { transform: translateY(-1px); }
.egc__save:disabled { opacity: 0.6; cursor: default; }
.egc__close { flex: none; width: 2rem; height: 2rem; border-radius: 9999px; display: flex; align-items: center; justify-content: center; color: #cdd8ea; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); cursor: pointer; font-size: 1rem; transition: background 0.15s ease; }
.egc__close:hover { background: rgba(255,255,255,0.14); }
.egc__title { width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.12); color: #f2f6fc; font-size: 1.35rem; font-weight: 600; padding: 0.2rem 0 0.5rem; outline: none; }
.egc__title::placeholder { color: #64769a; }
.egc__canvas {
  flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0.35rem 0.1rem 0.75rem; scrollbar-width: thin;
  /* Soften the scroll edge — see SocialGenerativeCanvas. */
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 34px), transparent 100%);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 34px), transparent 100%);
}
.egc__stack { display: flex; flex-direction: column; gap: 0.7rem; max-width: 620px; margin: 0 auto; width: 100%; }
.egc__block { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 0.85rem; padding: 0.9rem 1.05rem; will-change: transform, opacity; }
.egc__block-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.egc__cat { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; padding: 0.12rem 0.5rem; border-radius: 9999px; color: #f3f7fd; background: color-mix(in srgb, var(--tint) 55%, transparent); border: 1px solid color-mix(in srgb, var(--tint) 70%, transparent); }
.egc__bname { font-size: 0.8rem; color: #97a8c4; }
.egc__line { margin: 0.15rem 0; font-size: 0.9rem; line-height: 1.45; color: #cdd8ea; }
.egc__line--lead { font-size: 1rem; font-weight: 600; color: #eef3fa; }
.egc__line--muted { color: #7b8ba6; font-style: italic; }
.egc__empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.4rem; padding: 2.5rem 1rem; max-width: 640px; margin: 1.5rem auto 0; }
.egc__empty-title { margin: 0; font-size: 1.15rem; font-weight: 600; color: #dfe8f6; }
.egc__empty-sub { margin: 0; color: #9fb0cc; font-size: 0.9rem; line-height: 1.5; }
.egc__suggestions { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; width: 100%; }
.egc__chip { text-align: left; padding: 0.7rem 1rem; border-radius: 1rem; font-size: 0.86rem; line-height: 1.4; color: #d7e2f2; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); cursor: pointer; transition: background 0.15s ease, transform 0.15s ease, border-color 0.15s ease; }
.egc__chip:hover:not(:disabled) { background: rgba(255,255,255,0.09); border-color: rgba(120,200,160,0.45); transform: translateY(-1px); }
.egc__chip:disabled { opacity: 0.5; cursor: default; }
.egc__error { margin: 0; font-size: 0.85rem; color: #ff9a9a; }
.egc__bar { display: flex; align-items: flex-end; gap: 0.6rem; padding: 0.55rem 0.6rem 0.55rem 1rem; border-radius: 1.25rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px); }
.egc__input { flex: 1; resize: none; max-height: 140px; background: transparent; border: none; outline: none; color: #eaf1fb; font-size: 0.95rem; line-height: 1.5; padding: 0.35rem 0; font-family: inherit; }
.egc__input::placeholder { color: #8093ad; }
.egc__input:disabled { opacity: 0.6; }
.egc__send { flex: none; width: 2.4rem; height: 2.4rem; border-radius: 9999px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; color: #06210f; background: linear-gradient(180deg, #6fe3a6, #3fbe82); font-size: 1.05rem; transition: opacity 0.15s ease, transform 0.15s ease; }
.egc__send:hover:not(:disabled) { transform: translateY(-1px); }
.egc__send:disabled { opacity: 0.4; cursor: default; }
.egc__spin { animation: egc-spin 0.8s linear infinite; }
@keyframes egc-spin { to { transform: rotate(360deg); } }
.egc-fade-enter-from { opacity: 0; }
.egc-fade-leave-to { opacity: 0; }
.egc-fade-leave-active { position: absolute; }
</style>
