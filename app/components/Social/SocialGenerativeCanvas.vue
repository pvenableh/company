<script setup lang="ts">
/**
 * <SocialGenerativeCanvas> — the first builder wired to the Generative Canvas
 * kernel (shared/canvas.ts + useGenerativeCanvas + useCanvasChoreography).
 *
 * The pattern, made real for social: you speak an intent ("a week of posts
 * announcing the new retainer service, IG-forward, one carousel") and Earnest
 * drafts the posts live — each post card materialises with a staggered GSAP
 * rise, the presence aura breathes the build state (think → warm), and you
 * refine conversationally ("make the carousel punchier"). Nothing is published
 * — the social publishing kill-switch stays untouched; these are drafts you can
 * save into Studio and assign accounts to later.
 *
 * This component is the builder's whole contribution: (1) a block vocabulary,
 * (2) a thin CanvasBlock <-> social-post adapter, (3) the canvas view. All the
 * conversation, streaming, mood, and motion come from the kernel.
 */
import { toast } from 'vue-sonner';
import { useGenerativeCanvas } from '~/composables/useGenerativeCanvas';
import { useCanvasChoreography } from '~/composables/useCanvasChoreography';
import type { BlockKindSpec, CanvasBlock } from '~~/shared/canvas';
import type { PostType, SocialPlatform } from '~~/shared/social';

const props = defineProps<{
  /** Optional brief to ground the whole session (e.g. the client this is for). */
  brief?: string;
  /** Optional entity to ground brand/context. */
  entity?: { type: string; id: string };
}>();

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok', 'linkedin', 'facebook', 'threads'];
const PLATFORM_TINT: Record<SocialPlatform, string> = {
  instagram: '#d6336c',
  tiktok: '#111827',
  linkedin: '#2563eb',
  facebook: '#1877f2',
  threads: '#334155',
};

// ── (1) The block vocabulary the AI may emit for this builder ────────────────
const SOCIAL_BLOCK_KINDS: BlockKindSpec[] = [
  {
    kind: 'post',
    label: 'Social post',
    description:
      'One social media post. Write a real, publish-ready caption in the brand voice. Choose the platforms it targets and the post format.',
    shape:
      '{ caption: string (the full caption), platforms: ("instagram"|"tiktok"|"linkedin"|"facebook"|"threads")[], post_type: "image"|"video"|"carousel"|"reel"|"story"|"text"|"article", hashtags?: string[], cta_label?: string, cta_url?: string }',
  },
];

// ── The living presence brain, shared into the aura ──────────────────────────
const presence = useEarnestPresence({ initial: 'present' });

// ── (3) The canvas surface + its GSAP choreography ───────────────────────────
const canvasEl = ref<HTMLElement | null>(null);
const choreo = useCanvasChoreography(canvasEl, { stagger: 0.07, rise: 22, entrance: 'arc' });

const canvas = useGenerativeCanvas({
  canvasKind: 'social',
  blockKinds: SOCIAL_BLOCK_KINDS,
  presence,
  choreography: choreo,
  brief: props.brief,
  entity: props.entity,
});

const { blocks, messages, isStreaming, isDrafting, lastNote, error } = canvas;

// ── Intent field ─────────────────────────────────────────────────────────────
const intent = ref('');
const intentEl = ref<HTMLTextAreaElement | null>(null);

// Focus-style canned intents — each is just a natural-language prompt, exactly
// like the liquid intent sheet funnels through openEarnestPanel(prompt).
const SUGGESTIONS = [
  'A week of 5 posts announcing our new retainer service — Instagram-forward, one carousel, warm and confident.',
  'Three behind-the-scenes posts that build trust, no hard sell.',
  'A launch-day post for each platform, tuned to each channel’s voice.',
  'Two thoughtful LinkedIn posts sharing a lesson from a recent project.',
];

function submitIntent() {
  const text = intent.value.trim();
  if (!text || isStreaming.value) return;
  intent.value = '';
  canvas.sendIntent(text);
}

function runSuggestion(text: string) {
  if (isStreaming.value) return;
  canvas.sendIntent(text);
}

function onIntentKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submitIntent();
  }
}

// ── Post-card helpers ────────────────────────────────────────────────────────
function postPlatforms(block: CanvasBlock): SocialPlatform[] {
  const p = block.data?.platforms;
  const list = Array.isArray(p) ? p.filter((x): x is SocialPlatform => PLATFORMS.includes(x)) : [];
  return list.length ? list : ['instagram'];
}
function postType(block: CanvasBlock): PostType {
  return (block.data?.post_type as PostType) || 'image';
}
function hashtags(block: CanvasBlock): string[] {
  const h = block.data?.hashtags;
  return Array.isArray(h) ? h.slice(0, 8) : [];
}

// ── (2) Save drafts into Studio (real social_posts, status='draft') ──────────
const { create } = useComposition();
const { selectedOrg } = useOrganization();
const router = useRouter();
const saving = ref(false);

/** Leave the canvas — back to where they came from, else the Studio. */
function exit() {
  if (import.meta.client && window.history.length > 1) router.back();
  else router.push('/apps/marketing?floor=studio');
}

async function saveDrafts() {
  if (!blocks.value.length || saving.value) return;
  const org = typeof selectedOrg.value === 'string' ? selectedOrg.value : (selectedOrg.value as any)?.id;
  if (!org) {
    toast.error('No organization selected');
    return;
  }
  saving.value = true;
  let ok = 0;
  try {
    for (const block of blocks.value) {
      const caption = String(block.data?.caption || '').trim();
      if (!caption) continue;
      try {
        await create({
          kind: 'social',
          organization: org,
          body: caption,
          // Drafts save without account bindings — the user assigns accounts
          // in Studio before scheduling. status='draft' skips the account
          // requirement in the posts endpoint.
          targets: [],
          post_type: postType(block),
          status: 'draft',
          variants: null,
          cta_url: block.data?.cta_url || undefined,
          cta_label: block.data?.cta_label || undefined,
        });
        ok++;
      } catch (e: any) {
        console.error('[SocialGenerativeCanvas] save failed for a post:', e?.message);
      }
    }
    if (ok > 0) {
      presence.setMood('warm');
      presence.bump(0.7);
      toast.success(`Saved ${ok} draft${ok === 1 ? '' : 's'} to Studio`);
    } else {
      toast.error('Nothing saved — check the drafts and try again');
    }
  } finally {
    saving.value = false;
  }
}

const assistantLine = computed(() => {
  const last = [...messages.value].reverse().find((m) => m.role === 'assistant');
  return last?.content?.trim() || '';
});
</script>

<template>
  <div class="sgc">
    <!-- Living backdrop — the aura breathes the build state (mood from the kernel). -->
    <EarnestAura :presence="presence" class="sgc__aura" />

    <div class="sgc__inner">
      <!-- Header: presence + Earnest's short spoken line -->
      <header class="sgc__head">
        <div class="sgc__mark">
          <EarnestPresenceDot :colors="undefined" aperture />
        </div>
        <div class="sgc__head-copy">
          <p class="sgc__eyebrow">Draft with Earnest</p>
          <p class="sgc__note">
            <span v-if="isDrafting" class="sgc__note-live">Drafting…</span>
            <span v-else-if="assistantLine">{{ assistantLine }}</span>
            <span v-else-if="lastNote">{{ lastNote }}</span>
            <span v-else>Tell me what you want to post, and I’ll draft it here.</span>
          </p>
        </div>
        <button
          v-if="blocks.length"
          class="sgc__save"
          :disabled="saving"
          @click="saveDrafts"
        >
          {{ saving ? 'Saving…' : `Save ${blocks.length} to Studio` }}
        </button>
        <button class="sgc__close" aria-label="Close" title="Close" @click="exit">
          <Icon name="lucide:x" />
        </button>
      </header>

      <!-- The canvas: post cards materialise here -->
      <div ref="canvasEl" class="sgc__canvas">
        <TransitionGroup name="sgc-fade" tag="div" class="sgc__grid">
          <article
            v-for="block in blocks"
            :key="block.id"
            :data-canvas-block="block.id"
            class="sgc__card"
          >
            <div class="sgc__card-top">
              <span class="sgc__format">
                <SocialPlatformFrame :platforms="postPlatforms(block)" :post-type="postType(block)" />
                <span class="sgc__ptype">{{ postType(block) }}</span>
              </span>
              <div class="sgc__plats">
                <span
                  v-for="p in postPlatforms(block)"
                  :key="p"
                  class="sgc__plat"
                  :style="{ '--tint': PLATFORM_TINT[p] }"
                >{{ p }}</span>
              </div>
            </div>

            <p class="sgc__caption">{{ block.data?.caption }}</p>

            <div v-if="hashtags(block).length" class="sgc__tags">
              <span v-for="t in hashtags(block)" :key="t" class="sgc__tag">#{{ t.replace(/^#/, '') }}</span>
            </div>

            <a
              v-if="block.data?.cta_label"
              class="sgc__cta"
              :href="block.data?.cta_url || undefined"
              target="_blank"
              rel="noopener"
            >{{ block.data.cta_label }}</a>
          </article>
        </TransitionGroup>

        <!-- Empty state -->
        <div v-if="!blocks.length && !isDrafting" class="sgc__empty">
          <p class="sgc__empty-title">A blank canvas.</p>
          <p class="sgc__empty-sub">Describe the posts you want — I’ll draft the whole set, then we refine together.</p>
          <div class="sgc__suggestions">
            <button
              v-for="s in SUGGESTIONS"
              :key="s"
              class="sgc__chip"
              @click="runSuggestion(s)"
            >{{ s }}</button>
          </div>
        </div>
      </div>

      <p v-if="error" class="sgc__error">{{ error }}</p>

      <!-- Intent bar -->
      <div class="sgc__bar">
        <textarea
          ref="intentEl"
          v-model="intent"
          class="sgc__input"
          rows="1"
          :placeholder="blocks.length ? 'Refine, add, or restyle — e.g. “make the carousel punchier”' : 'What do you want to post?'"
          @focus="canvas.noteTyping()"
          @input="canvas.noteTyping()"
          @blur="canvas.noteRest()"
          @keydown="onIntentKeydown"
        />
        <button
          class="sgc__send"
          :disabled="!intent.trim() || isStreaming"
          @click="submitIntent"
        >
          <Icon :name="isStreaming ? 'lucide:loader-2' : 'lucide:arrow-up'" :class="{ 'sgc__spin': isStreaming }" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sgc {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a1220;
  color: #e8eef7;
  border-radius: 1.25rem;
}
.sgc__aura {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.5;
  pointer-events: none;
}
.sgc__inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  padding: 1.25rem clamp(1rem, 3vw, 2rem) 1.25rem;
}

/* Header */
.sgc__head {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.sgc__mark {
  position: relative;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sgc__head-copy { flex: 1; min-width: 0; }
.sgc__eyebrow {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #7e93b0;
  margin: 0;
}
.sgc__note {
  margin: 0.15rem 0 0;
  font-size: 0.95rem;
  line-height: 1.45;
  color: #cdd8ea;
  max-width: 60ch;
}
.sgc__note-live { color: #9fb4d6; }
.sgc__save {
  flex: none;
  border-radius: 9999px;
  padding: 0.5rem 1rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #06210f;
  background: linear-gradient(180deg, #6fe3a6, #3fbe82);
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.sgc__save:hover { transform: translateY(-1px); }
.sgc__save:disabled { opacity: 0.6; cursor: default; }
.sgc__close {
  flex: none; width: 2rem; height: 2rem; border-radius: 9999px; display: flex; align-items: center; justify-content: center;
  color: #cdd8ea; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); cursor: pointer;
  font-size: 1rem; transition: background 0.15s ease;
}
.sgc__close:hover { background: rgba(255,255,255,0.14); }

/* Canvas */
.sgc__canvas {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.35rem 0.1rem 0.75rem;
  scrollbar-width: thin;
  /* Soften the scroll edge so a card running past the fold reads as "there's
     more below", not as a card that got chopped. */
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 34px), transparent 100%);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 34px), transparent 100%);
}
.sgc__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.9rem;
  align-content: start;
}
.sgc__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1rem 1.05rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  will-change: transform, opacity;
}
.sgc__card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.sgc__format { display: inline-flex; align-items: center; gap: 0.4rem; color: #9fb4d6; }
.sgc__ptype {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #8ea3c2;
}
.sgc__plats { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.sgc__plat {
  font-size: 10px;
  text-transform: capitalize;
  padding: 0.12rem 0.5rem;
  border-radius: 9999px;
  color: #eaf1fb;
  background: color-mix(in srgb, var(--tint) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--tint) 70%, transparent);
}
.sgc__caption {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.5;
  color: #e8eef7;
  white-space: pre-wrap;
}
.sgc__tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.sgc__tag { font-size: 0.72rem; color: #7fb8e6; }
.sgc__cta {
  align-self: flex-start;
  margin-top: 0.15rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6fe3a6;
  text-decoration: none;
  border-bottom: 1px solid rgba(111, 227, 166, 0.4);
}

/* Empty state */
.sgc__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.4rem;
  padding: 2.5rem 1rem;
  max-width: 640px;
  margin: 1.5rem auto 0;
}
.sgc__empty-title { margin: 0; font-size: 1.15rem; font-weight: 600; color: #dfe8f6; }
.sgc__empty-sub { margin: 0; color: #9fb0cc; font-size: 0.9rem; line-height: 1.5; }
.sgc__suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
  width: 100%;
}
.sgc__chip {
  text-align: left;
  padding: 0.7rem 1rem;
  border-radius: 1rem;
  font-size: 0.86rem;
  line-height: 1.4;
  color: #d7e2f2;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}
.sgc__chip:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(120, 200, 160, 0.45);
  transform: translateY(-1px);
}

.sgc__error {
  margin: 0;
  font-size: 0.85rem;
  color: #ff9a9a;
}

/* Intent bar */
.sgc__bar {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  padding: 0.55rem 0.6rem 0.55rem 1rem;
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}
.sgc__input {
  flex: 1;
  resize: none;
  max-height: 140px;
  background: transparent;
  border: none;
  outline: none;
  color: #eaf1fb;
  font-size: 0.95rem;
  line-height: 1.5;
  padding: 0.35rem 0;
  font-family: inherit;
}
.sgc__input::placeholder { color: #8093ad; }
.sgc__send {
  flex: none;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  color: #06210f;
  background: linear-gradient(180deg, #6fe3a6, #3fbe82);
  font-size: 1.05rem;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.sgc__send:hover:not(:disabled) { transform: translateY(-1px); }
.sgc__send:disabled { opacity: 0.4; cursor: default; }
.sgc__spin { animation: sgc-spin 0.8s linear infinite; }
@keyframes sgc-spin { to { transform: rotate(360deg); } }

/* TransitionGroup fallback (GSAP owns the entrance; this covers reduced-motion). */
.sgc-fade-enter-from { opacity: 0; }
.sgc-fade-leave-to { opacity: 0; }
.sgc-fade-leave-active { position: absolute; }
</style>
