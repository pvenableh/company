<script setup lang="ts">
/**
 * Content Studio surface — `?floor=studio` on /apps/marketing.
 *
 * Decouples social posts from `social_accounts` so the team can design and
 * approve content for retainer clients without a live platform connection.
 *
 * Posts are grouped by project + target_month (Phase 3 of the retainer/social
 * plan). Drilldown opens a detail modal with approve / request-changes /
 * publish-ready actions.
 *
 * Out of scope for Phase 3:
 *   - Time-entry picker on posts (Phase 4)
 *   - Portal review surface (Phase 5)
 *   - Auto-promote to publisher on approve (Phase 6)
 */
import type { SocialPost, ApprovalState } from '~~/shared/social';
import type { Project, Client } from '~~/shared/directus';

const toast = useToast();
const { currentClient, selectedClient } = useClients();

const projectItems = useDirectusItems('projects');
const clientItems = useDirectusItems('clients');

// ── State ─────────────────────────────────────────────────────────
const posts = ref<SocialPost[]>([]);
const projectsById = ref<Map<string, Pick<Project, 'id' | 'title' | 'billing_type'> & { client?: { id: string; name: string } | null }>>(new Map());
const clientsById = ref<Map<string, Pick<Client, 'id' | 'name'>>>(new Map());
const loading = ref(false);

const stateFilter = ref<'all' | ApprovalState>('all');

const STATE_FILTERS: { key: 'all' | ApprovalState; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'In Review' },
  { key: 'requested_changes', label: 'Changes Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
];

// ── Create modal ──────────────────────────────────────────────────
const showCreate = ref(false);
const creating = ref(false);

function firstOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const form = ref({
  caption: '',
  post_type: 'image' as 'image' | 'video' | 'carousel' | 'reel' | 'story',
  project: '' as string,
  target_client: '' as string,
  design_image_url: '',
  figma_frame_url: '',
  target_month: firstOfThisMonth(),
});

function resetForm() {
  form.value = {
    caption: '',
    post_type: 'image',
    project: '',
    target_client: '',
    design_image_url: '',
    figma_frame_url: '',
    target_month: firstOfThisMonth(),
  };
}

// ── Detail drawer ─────────────────────────────────────────────────
const selectedPost = ref<SocialPost | null>(null);
const detailBusy = ref(false);

// ── Edit mode inside detail modal ─────────────────────────────────
// Approved/published posts are locked — changes after approval should
// go through a "Request Changes" cycle, not silent edits.
const editing = ref(false);
const savingEdit = ref(false);
const editForm = ref({
  caption: '',
  post_type: 'image' as 'image' | 'video' | 'carousel' | 'reel' | 'story',
  project: '' as string,
  target_client: '' as string,
  design_image_url: '',
  figma_frame_url: '',
  target_month: '',
});

function hydrateEditForm(post: SocialPost) {
  editForm.value = {
    caption: post.caption || '',
    post_type: (post.post_type as any) || 'image',
    project: post.project || '',
    target_client: post.target_client || '',
    design_image_url: post.design_image_url || '',
    figma_frame_url: post.figma_frame_url || '',
    target_month: post.target_month ? post.target_month.slice(0, 10) : '',
  };
}

const editLocked = computed(() => {
  const s = selectedPost.value?.approval_state;
  return s === 'approved' || s === 'published';
});

// ── Fetchers ──────────────────────────────────────────────────────
async function fetchPosts() {
  loading.value = true;
  try {
    const query: Record<string, string | number> = { limit: 200 };
    if (stateFilter.value !== 'all') query.approval_state = stateFilter.value;
    const r = await $fetch<{ data: SocialPost[] }>('/api/social/posts', { query });
    let list = r?.data ?? [];

    // Optional client scope. We match either `target_client` (Phase 3 binding)
    // or the legacy `client` field so older drafts still surface.
    if (selectedClient.value && selectedClient.value !== 'org') {
      const cid = selectedClient.value;
      list = list.filter((p) => p.target_client === cid || (p as any).client === cid);
    }
    posts.value = list;
  } catch (err) {
    console.error('Studio fetchPosts failed', err);
    posts.value = [];
  } finally {
    loading.value = false;
  }
}

async function fetchProjects() {
  try {
    const rows = await projectItems.list({
      fields: ['id', 'title', 'billing_type', 'client.id', 'client.name'],
      filter: { status: { _nin: ['Archived'] } },
      sort: ['-date_updated'],
      limit: 500,
    });
    const m = new Map();
    for (const p of rows) m.set(p.id, p);
    projectsById.value = m;
  } catch (err) {
    console.error('Studio fetchProjects failed', err);
  }
}

async function fetchClients() {
  try {
    const rows = await clientItems.list({
      fields: ['id', 'name'],
      sort: ['name'],
      limit: 500,
    });
    const m = new Map();
    for (const c of rows) m.set(c.id, c);
    clientsById.value = m;
  } catch (err) {
    console.error('Studio fetchClients failed', err);
  }
}

// ── Computed ──────────────────────────────────────────────────────
const projectOptions = computed(() => {
  const arr = Array.from(projectsById.value.values());
  return arr.map((p) => ({
    label: `${p.title}${p.client?.name ? ` — ${p.client.name}` : ''}`,
    value: p.id,
  }));
});

const clientOptions = computed(() =>
  Array.from(clientsById.value.values()).map((c) => ({ label: c.name, value: c.id })),
);

interface PostGroup {
  key: string;
  projectId: string | null;
  projectTitle: string;
  clientName: string | null;
  monthLabel: string;
  monthSort: string;
  posts: SocialPost[];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatYearMonth(iso: string): string {
  // Parse a YYYY-MM-DD (or longer) string as a date-only label, ignoring TZ.
  // `new Date("2026-05-01")` parses as UTC and can roll back a month in negative
  // offsets; we slice the year + month directly to avoid that.
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  const name = MONTH_NAMES[monthIdx] ?? `Month ${m[2]}`;
  return `${name} ${year}`;
}

const groups = computed<PostGroup[]>(() => {
  const byKey = new Map<string, PostGroup>();
  for (const post of posts.value) {
    const projectId = post.project ?? null;
    const monthIso = post.target_month || (post.scheduled_at ? post.scheduled_at.slice(0, 7) + '-01' : 'unknown');
    const key = `${projectId ?? 'none'}__${monthIso}`;
    if (!byKey.has(key)) {
      const project = projectId ? projectsById.value.get(projectId) : null;
      const clientId = post.target_client || project?.client?.id || null;
      const clientName = clientId ? clientsById.value.get(clientId)?.name || project?.client?.name || null : null;
      const monthLabel = monthIso === 'unknown' ? 'No target month' : formatYearMonth(monthIso);
      byKey.set(key, {
        key,
        projectId,
        projectTitle: project?.title || (projectId ? 'Project removed' : 'No project'),
        clientName,
        monthLabel,
        monthSort: monthIso,
        posts: [],
      });
    }
    byKey.get(key)!.posts.push(post);
  }
  return Array.from(byKey.values()).sort((a, b) => b.monthSort.localeCompare(a.monthSort));
});

const totalPosts = computed(() => posts.value.length);

const stateCounts = computed<Record<ApprovalState | 'all', number>>(() => {
  const out: Record<string, number> = { all: posts.value.length };
  for (const p of posts.value) {
    const k = p.approval_state || 'draft';
    out[k] = (out[k] || 0) + 1;
  }
  return out as Record<ApprovalState | 'all', number>;
});

// ── State badge ───────────────────────────────────────────────────
function stateTone(s: ApprovalState | undefined): string {
  switch (s) {
    case 'approved':
    case 'published':
      return 'bg-success/12 text-success border-success/30';
    case 'in_review':
      return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30';
    case 'requested_changes':
      return 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30';
    case 'rejected':
      return 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30';
    case 'scheduled':
      return 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30';
    default:
      return 'bg-muted/60 text-muted-foreground border-border';
  }
}

function stateLabel(s: ApprovalState | undefined): string {
  switch (s) {
    case 'in_review': return 'In Review';
    case 'requested_changes': return 'Changes Requested';
    default: return (s || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

// ── Actions ───────────────────────────────────────────────────────
async function createPost() {
  if (!form.value.caption.trim()) {
    toast.add({ title: 'Caption required', icon: 'i-lucide-alert-circle', color: 'yellow' });
    return;
  }
  creating.value = true;
  try {
    const body: Record<string, unknown> = {
      caption: form.value.caption.trim(),
      post_type: form.value.post_type,
      platforms: [],
      media_urls: [],
      media_types: [],
      status: 'draft',
      approval_state: 'draft',
    };
    if (form.value.project) body.project = form.value.project;
    if (form.value.target_client) body.target_client = form.value.target_client;
    if (form.value.design_image_url) body.design_image_url = form.value.design_image_url;
    if (form.value.figma_frame_url) body.figma_frame_url = form.value.figma_frame_url;
    if (form.value.target_month) body.target_month = form.value.target_month;

    await $fetch('/api/social/posts', { method: 'POST', body });
    toast.add({ title: 'Draft created', icon: 'i-lucide-check-circle', color: 'green' });
    showCreate.value = false;
    resetForm();
    await fetchPosts();
  } catch (err: any) {
    console.error('Studio createPost failed', err);
    toast.add({
      title: 'Could not create draft',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    creating.value = false;
  }
}

async function saveEdit() {
  if (!selectedPost.value) return;
  if (!editForm.value.caption.trim()) {
    toast.add({ title: 'Caption required', icon: 'i-lucide-alert-circle', color: 'yellow' });
    return;
  }
  savingEdit.value = true;
  try {
    const body: Record<string, unknown> = {
      caption: editForm.value.caption.trim(),
      post_type: editForm.value.post_type,
      project: editForm.value.project || null,
      target_client: editForm.value.target_client || null,
      design_image_url: editForm.value.design_image_url || null,
      figma_frame_url: editForm.value.figma_frame_url || null,
      target_month: editForm.value.target_month || null,
    };
    const r = await $fetch<{ data: SocialPost }>(`/api/social/posts/${selectedPost.value.id}`, {
      method: 'PATCH',
      body,
    });
    if (r?.data) {
      selectedPost.value = r.data;
      const idx = posts.value.findIndex((p) => p.id === r.data.id);
      if (idx >= 0) posts.value[idx] = r.data;
    }
    editing.value = false;
    toast.add({ title: 'Draft updated', icon: 'i-lucide-check-circle', color: 'green' });
  } catch (err: any) {
    console.error('Studio saveEdit failed', err);
    toast.add({
      title: 'Could not save',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    savingEdit.value = false;
  }
}

async function transition(post: SocialPost, next: ApprovalState) {
  detailBusy.value = true;
  try {
    const r = await $fetch<{ data: SocialPost }>(`/api/social/posts/${post.id}`, {
      method: 'PATCH',
      body: { approval_state: next },
    });
    selectedPost.value = r?.data ?? null;
    // Refresh list in place
    const idx = posts.value.findIndex((p) => p.id === post.id);
    if (idx >= 0 && r?.data) posts.value[idx] = r.data;
    toast.add({ title: `Marked ${stateLabel(next)}`, icon: 'i-lucide-check', color: 'green' });
  } catch (err: any) {
    console.error('Studio transition failed', err);
    toast.add({
      title: 'Could not update',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    detailBusy.value = false;
  }
}

const availableTransitions = computed<{ key: ApprovalState; label: string; icon: string; variant?: 'primary' | 'destructive' }[]>(() => {
  const s = selectedPost.value?.approval_state || 'draft';
  if (s === 'draft' || s === 'requested_changes') {
    return [
      { key: 'in_review', label: 'Send to Review', icon: 'lucide:send', variant: 'primary' },
    ];
  }
  if (s === 'in_review') {
    return [
      { key: 'approved', label: 'Approve', icon: 'lucide:check-circle', variant: 'primary' },
      { key: 'requested_changes', label: 'Request Changes', icon: 'lucide:rotate-ccw' },
      { key: 'rejected', label: 'Reject', icon: 'lucide:x-circle', variant: 'destructive' },
    ];
  }
  if (s === 'approved') {
    return [
      { key: 'requested_changes', label: 'Request Changes', icon: 'lucide:rotate-ccw' },
    ];
  }
  return [];
});

// ── Wiring ────────────────────────────────────────────────────────
function openDetail(post: SocialPost) {
  selectedPost.value = post;
  editing.value = false;
  hydrateEditForm(post);
}

function startEditing() {
  if (!selectedPost.value || editLocked.value) return;
  hydrateEditForm(selectedPost.value);
  editing.value = true;
}

function cancelEditing() {
  editing.value = false;
  if (selectedPost.value) hydrateEditForm(selectedPost.value);
}

watch(stateFilter, fetchPosts);
watch(selectedClient, () => {
  if (loading.value) return;
  fetchPosts();
});

onMounted(() => {
  fetchPosts();
  fetchProjects();
  fetchClients();
});
</script>

<template>
  <div>
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <p v-if="currentClient && (currentClient as any).id !== 'org'" class="cg-text-child text-muted-foreground">
        Studio scoped to <span class="font-medium text-foreground">{{ (currentClient as any).name }}</span>
      </p>
      <span v-else />
      <div class="flex items-center gap-1.5 ml-auto">
        <UiActionButton icon="lucide:plus" variant="primary" @click="showCreate = true">
          New Draft
        </UiActionButton>
      </div>
    </div>

    <!-- State pill tabs -->
    <div class="studio-tabs" role="tablist" aria-label="Approval state filter">
      <div class="studio-tabs__scroller">
        <button
          v-for="f in STATE_FILTERS"
          :key="f.key"
          type="button"
          role="tab"
          :aria-selected="stateFilter === f.key"
          class="studio-tabs__item"
          :class="{ 'studio-tabs__item--active': stateFilter === f.key }"
          @click="stateFilter = f.key"
        >
          <span class="studio-tabs__label">{{ f.label }}</span>
          <span
            v-if="stateCounts[f.key] !== undefined"
            class="studio-tabs__count"
          >{{ stateCounts[f.key] }}</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && !posts.length" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="cg-text-child text-muted-foreground">Loading content…</p>
    </div>

    <!-- Empty -->
    <div v-else-if="!groups.length" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:layout-grid" class="w-12 h-12 text-muted-foreground/40" />
      <div class="text-center">
        <p class="text-sm font-medium text-muted-foreground">No content yet</p>
        <p class="cg-text-child text-muted-foreground/70 mt-1">
          Draft a post and tie it to a retainer project — no account connection needed.
        </p>
      </div>
      <UiActionButton icon="lucide:plus" variant="primary" @click="showCreate = true">
        New Draft
      </UiActionButton>
    </div>

    <!-- Grouped list -->
    <div v-else class="space-y-6">
      <div v-for="g in groups" :key="g.key">
        <div class="flex items-baseline justify-between mb-2 px-1">
          <div>
            <h3 class="cg-text-header">
              {{ g.projectTitle }}
              <span v-if="g.clientName" class="text-muted-foreground font-normal"> · {{ g.clientName }}</span>
            </h3>
            <p class="cg-text-child text-muted-foreground">{{ g.monthLabel }}</p>
          </div>
          <span class="cg-text-child text-muted-foreground tabular-nums">
            {{ g.posts.length }} {{ g.posts.length === 1 ? 'post' : 'posts' }}
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            v-for="post in g.posts"
            :key="post.id"
            type="button"
            class="studio-card group"
            @click="openDetail(post)"
          >
            <div class="studio-card__media">
              <img
                v-if="post.design_image_url"
                :src="post.design_image_url"
                :alt="post.caption.slice(0, 80)"
                loading="lazy"
              />
              <img
                v-else-if="post.media_urls && post.media_urls.length"
                :src="post.media_urls[0]"
                :alt="post.caption.slice(0, 80)"
                loading="lazy"
              />
              <div v-else class="studio-card__placeholder">
                <Icon name="lucide:image" class="w-8 h-8 text-muted-foreground/40" />
              </div>
            </div>
            <div class="studio-card__body">
              <span class="studio-card__state" :class="stateTone(post.approval_state)">
                {{ stateLabel(post.approval_state) }}
              </span>
              <p class="cg-text-child text-foreground line-clamp-3 text-left">
                {{ post.caption || 'Untitled draft' }}
              </p>
              <div v-if="post.figma_frame_url" class="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Icon name="lucide:figma" class="w-3 h-3" />
                <span>Figma linked</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Create modal -->
    <UModal v-model="showCreate" :ui="{ width: 'sm:max-w-lg' }">
      <div class="p-5 space-y-4">
        <div>
          <h2 class="cg-text-header">New Content Draft</h2>
          <p class="cg-text-child text-muted-foreground">
            Tied to a retainer project, viewable by your team. No connected account required.
          </p>
        </div>

        <UFormGroup label="Caption" required>
          <UTextarea
            v-model="form.caption"
            :rows="4"
            placeholder="What's the post about?"
          />
        </UFormGroup>

        <div class="grid grid-cols-2 gap-3">
          <UFormGroup label="Project">
            <USelect
              v-model="form.project"
              :options="projectOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Pick a project"
            />
          </UFormGroup>
          <UFormGroup label="Target Client">
            <USelect
              v-model="form.target_client"
              :options="clientOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Pick a client"
            />
          </UFormGroup>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormGroup label="Type">
            <USelect
              v-model="form.post_type"
              :options="[
                { label: 'Image', value: 'image' },
                { label: 'Video', value: 'video' },
                { label: 'Carousel', value: 'carousel' },
                { label: 'Reel', value: 'reel' },
                { label: 'Story', value: 'story' },
              ]"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>
          <UFormGroup label="Target Month">
            <UInput v-model="form.target_month" type="date" />
          </UFormGroup>
        </div>

        <UFormGroup label="Design Image URL" hint="Cover art / mockup">
          <UInput v-model="form.design_image_url" placeholder="https://cdn…" />
        </UFormGroup>

        <UFormGroup label="Figma Frame URL" hint="Link to the source frame">
          <UInput v-model="form.figma_frame_url" placeholder="https://figma.com/file/…" />
        </UFormGroup>

        <div class="flex justify-end gap-2 pt-2">
          <UiActionButton @click="showCreate = false">Cancel</UiActionButton>
          <UiActionButton
            icon="lucide:check"
            variant="primary"
            :loading="creating"
            :disabled="!form.caption.trim()"
            @click="createPost"
          >
            Create Draft
          </UiActionButton>
        </div>
      </div>
    </UModal>

    <!-- Detail modal -->
    <UModal :model-value="!!selectedPost" :ui="{ width: 'sm:max-w-2xl' }" @update:model-value="(v) => { if (!v) { selectedPost = null; editing = false } }">
      <div v-if="selectedPost" class="p-5 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <span class="studio-card__state" :class="stateTone(selectedPost.approval_state)">
              {{ stateLabel(selectedPost.approval_state) }}
            </span>
            <h2 class="cg-text-header mt-2">{{ editing ? 'Edit Draft' : 'Content Draft' }}</h2>
            <p class="cg-text-child text-muted-foreground">
              {{ selectedPost.target_month ? formatYearMonth(selectedPost.target_month) : 'No target month' }}
            </p>
          </div>
          <div v-if="!editing && !editLocked" class="shrink-0">
            <UiActionButton icon="lucide:pencil" @click="startEditing">Edit</UiActionButton>
          </div>
        </div>

        <!-- Read-only body -->
        <template v-if="!editing">
          <div v-if="selectedPost.design_image_url || (selectedPost.media_urls && selectedPost.media_urls.length)" class="rounded-lg overflow-hidden border border-border bg-muted/30">
            <img
              :src="selectedPost.design_image_url || selectedPost.media_urls[0]"
              :alt="selectedPost.caption.slice(0, 80)"
              class="w-full h-auto max-h-96 object-contain"
            />
          </div>

          <div class="space-y-1">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Caption</p>
            <p class="text-sm text-foreground whitespace-pre-wrap">{{ selectedPost.caption || '(empty)' }}</p>
          </div>

          <div v-if="selectedPost.figma_frame_url">
            <a
              :href="selectedPost.figma_frame_url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Icon name="lucide:figma" class="w-3.5 h-3.5" />
              Open Figma frame
              <Icon name="lucide:external-link" class="w-3 h-3" />
            </a>
          </div>

          <div v-if="selectedPost.approved_at" class="rounded border border-success/30 bg-success/8 px-3 py-2 text-xs text-success">
            Approved {{ new Date(selectedPost.approved_at).toLocaleString() }}
          </div>

          <div class="flex flex-wrap justify-end gap-2 pt-3 border-t border-border">
            <UiActionButton
              v-for="t in availableTransitions"
              :key="t.key"
              :icon="t.icon"
              :variant="t.variant"
              :loading="detailBusy"
              @click="transition(selectedPost!, t.key)"
            >
              {{ t.label }}
            </UiActionButton>
          </div>
        </template>

        <!-- Edit body (mirrors create form) -->
        <template v-else>
          <UFormGroup label="Caption" required>
            <UTextarea v-model="editForm.caption" :rows="4" />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-3">
            <UFormGroup label="Project">
              <USelect
                v-model="editForm.project"
                :options="projectOptions"
                option-attribute="label"
                value-attribute="value"
                placeholder="Pick a project"
              />
            </UFormGroup>
            <UFormGroup label="Target Client">
              <USelect
                v-model="editForm.target_client"
                :options="clientOptions"
                option-attribute="label"
                value-attribute="value"
                placeholder="Pick a client"
              />
            </UFormGroup>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormGroup label="Type">
              <USelect
                v-model="editForm.post_type"
                :options="[
                  { label: 'Image', value: 'image' },
                  { label: 'Video', value: 'video' },
                  { label: 'Carousel', value: 'carousel' },
                  { label: 'Reel', value: 'reel' },
                  { label: 'Story', value: 'story' },
                ]"
                option-attribute="label"
                value-attribute="value"
              />
            </UFormGroup>
            <UFormGroup label="Target Month">
              <UInput v-model="editForm.target_month" type="date" />
            </UFormGroup>
          </div>

          <UFormGroup label="Design Image URL" hint="Cover art / mockup">
            <UInput v-model="editForm.design_image_url" placeholder="https://cdn…" />
          </UFormGroup>

          <UFormGroup label="Figma Frame URL" hint="Link to the source frame">
            <UInput v-model="editForm.figma_frame_url" placeholder="https://figma.com/file/…" />
          </UFormGroup>

          <div class="flex justify-end gap-2 pt-3 border-t border-border">
            <UiActionButton @click="cancelEditing">Cancel</UiActionButton>
            <UiActionButton
              icon="lucide:check"
              variant="primary"
              :loading="savingEdit"
              :disabled="!editForm.caption.trim()"
              @click="saveEdit"
            >
              Save Changes
            </UiActionButton>
          </div>
        </template>
      </div>
    </UModal>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.studio-tabs {
  @apply mb-5 flex;
  --accent-h: var(--app-accent-h, 220);
  --accent-s: var(--app-accent-s, 10%);
  --accent-l: var(--app-accent-l, 48%);
}

.studio-tabs__scroller {
  @apply inline-flex items-center gap-1 rounded-full
    border border-border bg-card p-0.5
    overflow-x-auto max-w-full;
  scrollbar-width: none;
}

.studio-tabs__scroller::-webkit-scrollbar {
  display: none;
}

.studio-tabs__item {
  @apply inline-flex items-center gap-1.5 rounded-full
    px-3 py-1 text-xs font-medium whitespace-nowrap
    text-muted-foreground transition-all duration-200
    ease-[cubic-bezier(0.16,1,0.3,1)];
}

.studio-tabs__item:hover {
  @apply text-foreground;
  background: hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.08);
}

.studio-tabs__label {
  @apply leading-none;
}

.studio-tabs__count {
  @apply ml-1 inline-flex items-center justify-center min-w-[18px] px-1
    rounded-full bg-muted/60 text-[10px] font-semibold leading-[16px]
    text-muted-foreground;
}

.studio-tabs__item--active {
  color: white;
  background: linear-gradient(
    135deg,
    hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%)),
    hsl(var(--accent-h) var(--accent-s) var(--accent-l))
  );
  box-shadow:
    0 1px 0 0 hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 14%) / 0.5) inset,
    0 4px 10px -6px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.55);
}

.studio-tabs__item--active .studio-tabs__count {
  @apply bg-white/20 text-white;
}

:global(html[data-chip-mode='neutral']) .studio-tabs__item--active,
:global(html[data-surface='glass']) .studio-tabs__item--active {
  background: linear-gradient(
    135deg,
    hsl(var(--primary) / 0.92),
    hsl(var(--primary))
  );
}

.studio-card {
  @apply flex flex-col text-left bg-card border border-border rounded-lg
    overflow-hidden transition-all duration-200
    hover:border-foreground/20 hover:shadow-md focus-visible:outline-none
    focus-visible:ring-2 focus-visible:ring-primary;
}

.studio-card__media {
  @apply relative aspect-square bg-muted/40 overflow-hidden;
}

.studio-card__media img {
  @apply w-full h-full object-cover transition-transform duration-300;
}

.studio-card:hover .studio-card__media img {
  @apply scale-[1.02];
}

.studio-card__placeholder {
  @apply absolute inset-0 flex items-center justify-center;
}

.studio-card__body {
  @apply p-3 space-y-2;
}

.studio-card__state {
  @apply inline-flex items-center px-2 py-0.5 rounded-full
    text-[10px] font-semibold uppercase tracking-wide
    border;
}
</style>
