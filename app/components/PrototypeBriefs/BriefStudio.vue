<!--
  BriefStudio — generate + review + copy Claude Code build briefs for a bespoke
  prototype, from a pitch or a proposal. The brief is a copy-ready Claude Code
  prompt (idea + brand + target + spec); briefs are persisted, so past ones show
  as history. Reused on both the pitch and proposal surfaces.
-->
<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  organization: string
  source: 'pitch' | 'proposal' | 'manual'
  link?: string | null
  pitch?: number | null
  proposal?: string | null
  seedTitle?: string | null
}>()

interface Brief { id: string | number; title: string; source: string; version: number; status: string; date_created: string; brief_markdown: string }

const idea = ref('')
const generating = ref(false)
const error = ref<string | null>(null)
const current = ref<Brief | null>(null)
const history = ref<Brief[]>([])
const copiedId = ref<string | number | null>(null)
const expanded = ref<Set<string | number>>(new Set())

async function loadHistory() {
  try {
    const r = await $fetch<{ data: Brief[] }>('/api/prototype-briefs', {
      query: {
        organization: props.organization,
        ...(props.pitch ? { pitch: props.pitch } : {}),
        ...(props.proposal ? { proposal: props.proposal } : {}),
        ...(props.link && !props.pitch && !props.proposal ? { link: props.link } : {}),
      },
    })
    history.value = r.data || []
  } catch { history.value = [] }
}

async function generate() {
  error.value = null
  generating.value = true
  try {
    const res = await $fetch<Brief>('/api/ai/generate-prototype-brief', {
      method: 'POST',
      body: {
        organization: props.organization,
        source: props.source,
        link: props.link || null,
        pitch: props.pitch ?? null,
        proposal: props.proposal ?? null,
        idea: idea.value.trim() || undefined,
        title: props.seedTitle || undefined,
      },
    })
    current.value = res
    if (res.id != null) history.value = [res, ...history.value.filter((b) => b.id !== res.id)]
  } catch (err: any) {
    error.value = err?.data?.message || (err?.data?.data?.sellSheet ? 'You’ve reached your AI token limit.' : 'Could not generate the brief.')
  } finally {
    generating.value = false
  }
}

async function copy(text: string, id: string | number) {
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = id
    setTimeout(() => { if (copiedId.value === id) copiedId.value = null }, 1800)
  } catch { /* ignore */ }
}
function toggle(id: string | number) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}
function close() { open.value = false }

watch(open, (v) => {
  if (v) { error.value = null; current.value = null; idea.value = ''; loadHistory() }
})
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" @click.self="close">
    <div class="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">
      <!-- header -->
      <div class="flex items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <div class="flex items-center gap-2">
            <Icon name="lucide:terminal" class="h-4 w-4 text-primary" />
            <h3 class="text-sm font-semibold text-foreground">Prototype build brief</h3>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            Earnest writes a Claude Code prompt — brand + target + spec — to build a bespoke prototype. Copy it into Claude Code.
          </p>
        </div>
        <button class="rounded-full p-1.5 text-muted-foreground hover:bg-muted" @click="close"><Icon name="lucide:x" class="h-4 w-4" /></button>
      </div>

      <div class="max-h-[70vh] overflow-y-auto p-5">
        <!-- generate -->
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">What should the prototype be? (optional)</span>
          <textarea v-model="idea" rows="3" placeholder="e.g. An interactive private-events pitch page: three venue bands with parallax + a room-size finder."
            class="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40"></textarea>
        </label>
        <p v-if="error" class="mt-2 text-sm text-rose-500">{{ error }}</p>
        <button :disabled="generating" class="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" @click="generate">
          <Icon :name="generating ? 'lucide:loader-2' : 'lucide:sparkles'" :class="['h-4 w-4', generating && 'animate-spin']" />
          {{ generating ? 'Writing the brief…' : current ? 'Regenerate' : 'Generate brief' }}
        </button>

        <!-- current result -->
        <div v-if="current" class="mt-5 rounded-xl border border-primary/30 bg-primary/[0.04]">
          <div class="flex items-center justify-between gap-2 border-b border-primary/20 px-4 py-2.5">
            <span class="truncate text-xs font-medium text-foreground">{{ current.title }} · v{{ current.version }}</span>
            <button class="rounded-full border border-border bg-background px-3 py-1 text-xs" @click="copy(current!.brief_markdown, current!.id)">
              {{ copiedId === current.id ? 'Copied' : 'Copy prompt' }}
            </button>
          </div>
          <pre class="max-h-72 overflow-auto whitespace-pre-wrap px-4 py-3 text-[12.5px] leading-relaxed text-foreground">{{ current.brief_markdown }}</pre>
        </div>

        <!-- history -->
        <div v-if="history.length" class="mt-6">
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Past briefs</p>
          <div class="grid gap-2">
            <div v-for="b in history" :key="b.id" class="rounded-lg border border-border">
              <button class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left" @click="toggle(b.id)">
                <span class="min-w-0 truncate text-xs font-medium text-foreground">{{ b.title }} <span class="text-muted-foreground">· v{{ b.version }} · {{ new Date(b.date_created).toLocaleDateString() }}</span></span>
                <Icon :name="expanded.has(b.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
              <div v-if="expanded.has(b.id)" class="border-t border-border">
                <div class="flex justify-end px-3 py-2">
                  <button class="rounded-full border border-border bg-background px-3 py-1 text-xs" @click="copy(b.brief_markdown, b.id)">{{ copiedId === b.id ? 'Copied' : 'Copy prompt' }}</button>
                </div>
                <pre class="max-h-64 overflow-auto whitespace-pre-wrap px-3 pb-3 text-[12px] leading-relaxed text-muted-foreground">{{ b.brief_markdown }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
