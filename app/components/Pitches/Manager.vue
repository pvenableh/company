<script setup lang="ts">
/**
 * PitchesManager — the pitch-page management surface, folded into
 * People → Pursuits → Pitches (it used to be a standalone /pitches app).
 *
 * Staff surface to publish bespoke, self-contained HTML pitches behind a gated
 * share link (optional password + expiry). Uploads the .html + its local assets
 * (e.g. a walkthrough .mp4); the server rewrites asset refs into the org's Files
 * tree and re-hosts Google Fonts so the served pitch hits no external CDN.
 *
 * Reads `?for=<type>:<id>` off the route to pre-link + open the create form
 * (used by a client's / lead's "+ New → Pitch page").
 */
interface LinkedRef {
  type: 'client' | 'lead' | 'contact'
  label: string
  to: string
  value: string
}
interface PitchRow {
  id: string
  title: string
  client_name: string | null
  token: string
  status: 'draft' | 'published' | 'revoked'
  expires_at: string | null
  view_count: number
  last_viewed_at: string | null
  date_created: string
  has_password: boolean
  linked: LinkedRef | null
  url: string
}

const { selectedOrg } = useOrganization()

const rows = ref<PitchRow[]>([])
const loading = ref(true)
const showForm = ref(false)
// When set, the form edits this pitch's metadata instead of creating a new one.
const editingId = ref<string | null>(null)
const isEditing = computed(() => !!editingId.value)

// ── Create form state ────────────────────────────────────────────────────────
const form = reactive({
  title: '',
  client_name: '',
  // Optional link to a real record, encoded as "<type>:<id>" (e.g. "client:uuid",
  // "lead:42", "contact:uuid"). Empty = link to nobody (client_name fallback).
  link: '',
  password: '',
  expires_at: '',
  publish: true,
})

// Pickable records for the "For" selector, grouped by type.
type LinkOption = { id: string | number; label: string }
const linkOptions = ref<{ clients: LinkOption[]; leads: LinkOption[]; contacts: LinkOption[] }>({
  clients: [], leads: [], contacts: [],
})
async function loadLinkOptions() {
  if (!selectedOrg.value) { linkOptions.value = { clients: [], leads: [], contacts: [] }; return }
  try {
    linkOptions.value = await $fetch('/api/pitches/link-options', {
      query: { organization: selectedOrg.value },
    })
  } catch {
    linkOptions.value = { clients: [], leads: [], contacts: [] }
  }
}
const htmlFile = ref<File | null>(null)
const assetFiles = ref<File[]>([])
const submitting = ref(false)
const formError = ref<string | null>(null)
const justCreated = ref<{ title: string; url: string } | null>(null)
// True when justCreated came from the AI generator (a DRAFT to review) rather
// than a published upload — flips the confirmation copy.
const justCreatedDraft = ref(false)

// ── Generate-with-Earnest state ──────────────────────────────────────────────
const showGenerate = ref(false)
const genForm = reactive({
  link: '',
  title: '',
  brief: '',
  password: '',
  expires_at: '',
  settings: {
    mode: 'dark' as 'dark' | 'light',
    accent: '#c8963e',
    font: 'serif' as 'serif' | 'sans',
    titleStyle: 'editorial' as 'editorial' | 'bold' | 'minimal',
  },
})
const generating = ref(false)
const genError = ref<string | null>(null)
const genStage = ref('')

function openGenerate() {
  showForm.value = false
  genError.value = null
  showGenerate.value = true
  ensureLinkOptions()
}
function closeGenerate() { showGenerate.value = false; genError.value = null }

async function generate() {
  genError.value = null
  if (!selectedOrg.value) { genError.value = 'Select an organization first.'; return }
  generating.value = true
  const stages = ['Studying the brand & history…', 'Writing the pitch…', 'Composing the page…']
  let si = 0; genStage.value = stages[0]
  const iv = setInterval(() => { si = Math.min(si + 1, stages.length - 1); genStage.value = stages[si] }, 2600)
  try {
    const res = await $fetch<{ url: string; title: string; status: string }>('/api/pitches/generate', {
      method: 'POST',
      body: {
        organization: String(selectedOrg.value),
        link: genForm.link || null,
        brief: genForm.brief.trim() || undefined,
        title: genForm.title.trim() || undefined,
        settings: { mode: genForm.settings.mode, accent: genForm.settings.accent, font: genForm.settings.font, titleStyle: genForm.settings.titleStyle },
        password: genForm.password || null,
        expires_at: genForm.expires_at || null,
      },
    })
    justCreated.value = { title: res.title, url: res.url }
    justCreatedDraft.value = true
    showGenerate.value = false
    Object.assign(genForm, { link: '', title: '', brief: '', password: '', expires_at: '' })
    await load()
  } catch (err: any) {
    genError.value = err?.data?.message || (err?.data?.data?.sellSheet ? 'You’ve reached your AI token limit.' : 'Could not generate the pitch.')
  } finally {
    clearInterval(iv); generating.value = false; genStage.value = ''
  }
}

const origin = computed(() => (import.meta.client ? window.location.origin : ''))
function fullUrl(u: string) { return `${origin.value}${u}` }

async function load() {
  if (!selectedOrg.value) { rows.value = []; loading.value = false; return }
  loading.value = true
  try {
    const r = await $fetch<{ data: PitchRow[] }>('/api/pitches', {
      query: { organization: selectedOrg.value },
    })
    rows.value = r.data || []
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function onHtmlPick(e: Event) {
  htmlFile.value = (e.target as HTMLInputElement).files?.[0] || null
  if (htmlFile.value && !form.title) form.title = htmlFile.value.name.replace(/\.html?$/i, '')
}
function onAssetsPick(e: Event) {
  assetFiles.value = Array.from((e.target as HTMLInputElement).files || [])
}

function resetForm() {
  Object.assign(form, { title: '', client_name: '', link: '', password: '', expires_at: '', publish: true })
  htmlFile.value = null
  assetFiles.value = []
  formError.value = null
}
function openCreate() {
  editingId.value = null
  resetForm()
  showForm.value = true
}
function closeForm() {
  showForm.value = false
  editingId.value = null
  resetForm()
}
function ensureLinkOptions() {
  if (!linkOptions.value.clients.length && !linkOptions.value.leads.length && !linkOptions.value.contacts.length) loadLinkOptions()
}
function startEdit(row: PitchRow) {
  editingId.value = row.id
  Object.assign(form, {
    title: row.title,
    client_name: row.client_name || '',
    link: row.linked?.value || '',
    password: '',
    expires_at: row.expires_at ? row.expires_at.slice(0, 10) : '',
    publish: true,
  })
  htmlFile.value = null
  assetFiles.value = []
  formError.value = null
  showForm.value = true
  ensureLinkOptions()
}

// Decode the "For" select into the matching FK, nulling the others.
function linkFields(): { lead: number | null; client: string | null; contact: string | null } {
  const out = { lead: null as number | null, client: null as string | null, contact: null as string | null }
  if (form.link) {
    const [type, ...rest] = form.link.split(':')
    const id = rest.join(':')
    if (type === 'client') out.client = id
    else if (type === 'contact') out.contact = id
    else if (type === 'lead') out.lead = Number(id)
  }
  return out
}

async function submitEdit() {
  formError.value = null
  if (!form.title.trim()) { formError.value = 'Give the pitch a title.'; return }
  submitting.value = true
  try {
    const { lead, client, contact } = linkFields()
    const payload: Record<string, any> = {
      title: form.title.trim(),
      client_name: form.link ? null : form.client_name.trim(),
      lead, client, contact,
      expires_at: form.expires_at || null,
    }
    // Blank password on edit = leave unchanged (only send when the user typed one).
    if (form.password) payload.password = form.password
    await $fetch(`/api/pitches/${editingId.value}`, { method: 'PATCH', body: payload })
    closeForm()
    await load()
  } catch (err: any) {
    formError.value = err?.data?.message || 'Could not save changes.'
  } finally {
    submitting.value = false
  }
}

async function submit() {
  if (isEditing.value) return submitEdit()
  formError.value = null
  if (!selectedOrg.value) { formError.value = 'Select an organization first.'; return }
  if (!htmlFile.value) { formError.value = 'Choose the pitch .html file.'; return }
  if (!form.title.trim()) { formError.value = 'Give the pitch a title.'; return }

  submitting.value = true
  try {
    const fd = new FormData()
    fd.append('organization', String(selectedOrg.value))
    fd.append('title', form.title.trim())
    fd.append('client_name', form.client_name.trim())
    // Decode the "For" selection into the matching FK field.
    if (form.link) {
      const [type, ...rest] = form.link.split(':')
      const id = rest.join(':')
      if (type === 'client' || type === 'lead' || type === 'contact') fd.append(type, id)
    }
    fd.append('password', form.password)
    fd.append('expires_at', form.expires_at)
    fd.append('publish', String(form.publish))
    fd.append('html', htmlFile.value)
    for (const a of assetFiles.value) fd.append('asset', a)

    const res = await $fetch<{ url: string }>('/api/pitches', { method: 'POST', body: fd })
    justCreated.value = { title: form.title.trim(), url: res.url }
    justCreatedDraft.value = !form.publish
    // reset
    Object.assign(form, { title: '', client_name: '', link: '', password: '', expires_at: '', publish: true })
    htmlFile.value = null
    assetFiles.value = []
    showForm.value = false
    await load()
  } catch (err: any) {
    formError.value = err?.data?.message || 'Could not create the pitch.'
  } finally {
    submitting.value = false
  }
}

// ── Pitch → Proposal ─────────────────────────────────────────────────────────
// From a pitch comes a proposal: open the proposal create slide-over, seeded
// with the pitch's lead when it links one (they share the Pursuit's record).
const { openCreate: openProposalCreate } = useCreatePanel('proposal')
function createProposalFromPitch(row: PitchRow) {
  const leadId = row.linked?.value?.startsWith('lead:') ? Number(row.linked.value.slice(5)) : null
  openProposalCreate({ leadId })
}

// ── Prototype build brief (Claude Code) ─────────────────────────────────────
const brief = reactive({ open: false, pitch: null as number | null, link: '', title: '' })
function openBrief(row: PitchRow) {
  brief.pitch = Number(row.id)
  brief.link = row.linked?.value || ''
  brief.title = row.title || ''
  brief.open = true
}

const copiedToken = ref<string | null>(null)
async function copyLink(row: { token: string; url: string }) {
  try {
    await navigator.clipboard.writeText(fullUrl(row.url))
    copiedToken.value = row.token
    setTimeout(() => { if (copiedToken.value === row.token) copiedToken.value = null }, 1600)
  } catch { /* ignore */ }
}

async function setStatus(row: PitchRow, status: 'published' | 'revoked') {
  await $fetch(`/api/pitches/${row.id}`, { method: 'PATCH', body: { status } })
  await load()
}

function statusClass(s: string) {
  return s === 'published' ? 'bg-emerald-500/15 text-emerald-500'
    : s === 'revoked' ? 'bg-rose-500/15 text-rose-500'
    : 'bg-muted text-muted-foreground'
}
function isExpired(row: PitchRow) {
  return row.expires_at ? Date.now() > new Date(row.expires_at).getTime() : false
}

// Deep-link prefill: ?for=client:<id> (from a lead/client's "+ New" menu) opens
// the create form pre-linked to that record. Watched (not just onMounted) so it
// works when this component mounts fresh on lens switch AND on same-route query
// changes.
const route = useRoute()
function applyForParam(forParam: unknown) {
  if (typeof forParam === 'string' && /^(client|lead|contact):.+/.test(forParam)) {
    form.link = forParam
    showForm.value = true
  }
}

watch(selectedOrg, () => { load(); loadLinkOptions() })
// Fetch pickable records the first time the form is opened.
watch(showForm, (open) => { if (open && !linkOptions.value.clients.length && !linkOptions.value.leads.length && !linkOptions.value.contacts.length) loadLinkOptions() })
watch(() => route.query.for, (v) => applyForParam(v))
onMounted(() => {
  load()
  loadLinkOptions()
  applyForParam(route.query.for)
})
</script>

<template>
  <div class="max-w-5xl">
    <!-- Header -->
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-base font-semibold text-foreground">Pitch pages</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Publish a bespoke pitch behind a private link — with an optional password and expiry.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          class="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          @click="showGenerate ? closeGenerate() : openGenerate()"
        >
          <Icon :name="showGenerate ? 'lucide:x' : 'lucide:sparkles'" class="h-4 w-4" />
          {{ showGenerate ? 'Close' : 'Generate with Earnest' }}
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          @click="showForm ? closeForm() : openCreate()"
        >
          <Icon :name="showForm ? 'lucide:x' : 'lucide:plus'" class="h-4 w-4" />
          {{ showForm ? 'Close' : 'New pitch' }}
        </button>
      </div>
    </div>

    <!-- Just-created confirmation -->
    <div
      v-if="justCreated"
      class="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-foreground">
          <template v-if="justCreatedDraft">“{{ justCreated.title }}” — draft ready to review.</template>
          <template v-else>“{{ justCreated.title }}” is live.</template>
        </p>
        <p class="truncate text-xs text-muted-foreground">
          <template v-if="justCreatedDraft">Preview it, then publish from the list below before sharing · </template>{{ fullUrl(justCreated.url) }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <a :href="justCreated.url" target="_blank" rel="noopener"
          class="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted">Preview</a>
        <button
          class="rounded-full border border-border px-3 py-1.5 text-xs"
          @click="copyLink({ token: 'new', url: justCreated!.url })"
        >
          {{ copiedToken === 'new' ? 'Copied' : 'Copy link' }}
        </button>
      </div>
    </div>

    <!-- Generate with Earnest -->
    <form
      v-if="showGenerate"
      class="mb-8 grid gap-4 rounded-2xl border border-primary/30 bg-primary/[0.04] p-5"
      @submit.prevent="generate"
    >
      <div class="flex items-center gap-2">
        <Icon name="lucide:sparkles" class="h-4 w-4 text-primary" />
        <p class="text-xs font-medium uppercase tracking-wide text-primary">Generate a pitch with Earnest</p>
      </div>
      <p class="-mt-2 text-xs text-muted-foreground">
        Earnest drafts an on-brand pitch using your positioning and this client's context + history. You review it before sharing.
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pitch to</span>
          <select v-model="genForm.link"
            class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
            <option value="">Choose a client, lead, or contact…</option>
            <optgroup v-if="linkOptions.clients.length" label="Clients">
              <option v-for="o in linkOptions.clients" :key="`gc-${o.id}`" :value="`client:${o.id}`">{{ o.label }}</option>
            </optgroup>
            <optgroup v-if="linkOptions.leads.length" label="Leads / opportunities">
              <option v-for="o in linkOptions.leads" :key="`gl-${o.id}`" :value="`lead:${o.id}`">{{ o.label }}</option>
            </optgroup>
            <optgroup v-if="linkOptions.contacts.length" label="Contacts">
              <option v-for="o in linkOptions.contacts" :key="`gp-${o.id}`" :value="`contact:${o.id}`">{{ o.label }}</option>
            </optgroup>
          </select>
        </label>
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title (optional)</span>
          <input v-model="genForm.title" type="text" placeholder="Auto-titled if left blank"
            class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
        </label>
      </div>

      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">What should this pitch emphasise? (optional)</span>
        <textarea v-model="genForm.brief" rows="3" placeholder="e.g. Lead with our hospitality branding work; they're opening a second location on Ocean Drive."
          class="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40"></textarea>
      </label>

      <!-- Look & feel -->
      <div class="grid gap-3 rounded-xl border border-border/60 bg-background/50 p-4 sm:grid-cols-4">
        <label class="grid gap-1.5">
          <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Mode</span>
          <select v-model="genForm.settings.mode" class="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label class="grid gap-1.5">
          <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Accent</span>
          <input v-model="genForm.settings.accent" type="color" class="h-9 w-full cursor-pointer rounded-lg border border-border bg-background">
        </label>
        <label class="grid gap-1.5">
          <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</span>
          <select v-model="genForm.settings.font" class="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none">
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
          </select>
        </label>
        <label class="grid gap-1.5">
          <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Title style</span>
          <select v-model="genForm.settings.titleStyle" class="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none">
            <option value="editorial">Editorial</option>
            <option value="bold">Bold</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Password (optional)</span>
          <input v-model="genForm.password" type="text" autocomplete="off" placeholder="Leave blank for no password"
            class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
        </label>
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expires (optional)</span>
          <input v-model="genForm.expires_at" type="date"
            class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
        </label>
      </div>

      <p v-if="genError" class="text-sm text-rose-500">{{ genError }}</p>
      <div class="flex items-center gap-3">
        <button type="submit" :disabled="generating"
          class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
          <Icon :name="generating ? 'lucide:loader-2' : 'lucide:sparkles'" :class="['h-4 w-4', generating && 'animate-spin']" />
          {{ generating ? 'Generating…' : 'Generate draft' }}
        </button>
        <span v-if="generating && genStage" class="text-xs text-muted-foreground">{{ genStage }}</span>
      </div>
    </form>

    <!-- Create form -->
    <form
      v-if="showForm"
      class="mb-8 grid gap-4 rounded-2xl border border-border bg-card p-5"
      @submit.prevent="submit"
    >
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {{ isEditing ? 'Edit pitch' : 'New pitch' }}
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</span>
          <input v-model="form.title" type="text" placeholder="e.g. Q3 Partnership Pitch"
            class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
        </label>
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">For (optional)</span>
          <select v-model="form.link"
            class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
            <option value="">Not linked — just a name</option>
            <optgroup v-if="linkOptions.clients.length" label="Clients">
              <option v-for="o in linkOptions.clients" :key="`c-${o.id}`" :value="`client:${o.id}`">{{ o.label }}</option>
            </optgroup>
            <optgroup v-if="linkOptions.leads.length" label="Leads / opportunities">
              <option v-for="o in linkOptions.leads" :key="`l-${o.id}`" :value="`lead:${o.id}`">{{ o.label }}</option>
            </optgroup>
            <optgroup v-if="linkOptions.contacts.length" label="Contacts">
              <option v-for="o in linkOptions.contacts" :key="`p-${o.id}`" :value="`contact:${o.id}`">{{ o.label }}</option>
            </optgroup>
          </select>
        </label>
      </div>

      <label v-if="!form.link" class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Or type a client name (optional)</span>
        <input v-model="form.client_name" type="text" placeholder="e.g. Acme Co."
          class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
      </label>

      <div v-if="!isEditing" class="grid gap-4 sm:grid-cols-2">
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pitch file (.html)</span>
          <input type="file" accept=".html,text/html" class="text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            @change="onHtmlPick">
        </label>
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assets (video, images)</span>
          <input type="file" multiple class="text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            @change="onAssetsPick">
        </label>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Password (optional)</span>
          <input v-model="form.password" type="text" autocomplete="off" :placeholder="isEditing ? 'Leave blank to keep unchanged' : 'Leave blank for no password'"
            class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
        </label>
        <label class="grid gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expires (optional)</span>
          <input v-model="form.expires_at" type="date"
            class="rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40">
        </label>
      </div>

      <label v-if="!isEditing" class="flex items-center gap-2 text-sm text-muted-foreground">
        <input v-model="form.publish" type="checkbox" class="h-4 w-4 rounded border-border">
        Publish immediately (make the link live now)
      </label>
      <p v-else class="text-xs text-muted-foreground">
        Editing details only — the pitch's HTML stays as uploaded. Use Revoke / Republish to change its live status.
      </p>

      <p v-if="formError" class="text-sm text-rose-500">{{ formError }}</p>

      <div class="flex justify-end">
        <button type="submit" :disabled="submitting"
          class="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-50">
          <Icon v-if="submitting" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
          {{ submitting ? (isEditing ? 'Saving…' : 'Publishing…') : (isEditing ? 'Save changes' : 'Create pitch') }}
        </button>
      </div>
    </form>

    <!-- List -->
    <div v-if="loading" class="flex items-center gap-2 py-12 text-sm text-muted-foreground">
      <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" /> Loading pitches…
    </div>
    <div v-else-if="!rows.length" class="rounded-2xl border border-dashed border-border py-14 text-center">
      <Icon name="lucide:sparkles" class="mx-auto h-8 w-8 text-muted-foreground/60" />
      <p class="mt-3 text-sm text-muted-foreground">No pitches yet. Create one to get a shareable link.</p>
    </div>
    <ul v-else class="grid gap-3">
      <li v-for="row in rows" :key="row.id"
        class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium text-foreground">{{ row.title }}</span>
            <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide" :class="statusClass(row.status)">
              {{ row.status }}
            </span>
            <span v-if="isExpired(row)" class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500">expired</span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <NuxtLink v-if="row.linked" :to="row.linked.to" class="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
              <Icon :name="row.linked.type === 'client' ? 'lucide:building-2' : row.linked.type === 'lead' ? 'lucide:target' : 'lucide:user'" class="h-3 w-3" />
              {{ row.linked.label }}
            </NuxtLink>
            <span v-else-if="row.client_name">{{ row.client_name }}</span>
            <span class="inline-flex items-center gap-1"><Icon name="lucide:eye" class="h-3 w-3" />{{ row.view_count }}</span>
            <span v-if="row.has_password" class="inline-flex items-center gap-1"><Icon name="lucide:lock" class="h-3 w-3" />password</span>
            <span v-if="row.expires_at" class="inline-flex items-center gap-1"><Icon name="lucide:clock" class="h-3 w-3" />{{ new Date(row.expires_at).toLocaleDateString() }}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button class="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs" @click="startEdit(row)">
            <Icon name="lucide:pencil" class="h-3 w-3" /> Edit
          </button>
          <button class="rounded-full border border-border px-3 py-1.5 text-xs" @click="copyLink(row)">
            {{ copiedToken === row.token ? 'Copied' : 'Copy link' }}
          </button>
          <a :href="row.url" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs">
            <Icon name="lucide:external-link" class="h-3 w-3" /> Open
          </a>
          <button class="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs" @click="createProposalFromPitch(row)" title="Create a proposal from this pitch">
            <Icon name="lucide:file-text" class="h-3 w-3" /> Proposal
          </button>
          <button class="inline-flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1.5 text-xs text-primary" @click="openBrief(row)">
            <Icon name="lucide:terminal" class="h-3 w-3" /> Build brief
          </button>
          <button v-if="row.status !== 'revoked'" class="rounded-full border border-rose-500/40 px-3 py-1.5 text-xs text-rose-500" @click="setStatus(row, 'revoked')">
            Revoke
          </button>
          <button v-else class="rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-500" @click="setStatus(row, 'published')">
            Republish
          </button>
        </div>
      </li>
    </ul>

    <PrototypeBriefsBriefStudio
      v-if="selectedOrg"
      v-model:open="brief.open"
      :organization="String(selectedOrg)"
      source="pitch"
      :pitch="brief.pitch"
      :link="brief.link || null"
      :seed-title="brief.title || null"
    />
  </div>
</template>
