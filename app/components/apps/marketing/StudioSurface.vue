<script setup lang="ts">
/**
 * Content Studio surface — `?floor=studio` on /apps/marketing.
 *
 * Plans are the sole top-level primitive: each post belongs to exactly one
 * content_plan (per-org Inbox plan for unsorted drafts). Clicking a plan
 * card opens /social/plans/[id]; clicking an individual post inside a plan
 * opens the per-post detail modal for inline approve / request-changes /
 * schedule actions. New posts are minted via the Compose chooser (social
 * or email), which drops the user into the in-canvas composer at z=3 and
 * find-or-creates the appropriate Inbox plan automatically server-side.
 */
import type { SocialPost, ApprovalState, ContentPlanRecord } from '~~/shared/social';
import type { Project, Client } from '~~/shared/directus';
import SocialRiverSurface from '~/components/Social/RiverSurface.vue';
import SocialInboxSurface from '~/components/Social/InboxSurface.vue';
import SocialAnalyticsSurface from '~/components/Social/AnalyticsSurface.vue';
import CompositionCanvas from '~/components/Social/CompositionCanvas.vue';
import StudioPostCard from './StudioPostCard.vue';
import PlanGridCard from './PlanGridCard.vue';

const toast = useToast();
const { currentClient, selectedClient } = useClients();

const projectItems = useDirectusItems('projects');
const clientItems = useDirectusItems('clients');

// ── State ─────────────────────────────────────────────────────────
const posts = ref<SocialPost[]>([]);
const projectsById = ref<Map<string, Pick<Project, 'id' | 'title' | 'billing_type'> & { client?: { id: string; name: string } | null }>>(new Map());
const clientsById = ref<Map<string, Pick<Client, 'id' | 'name'>>>(new Map());
const loading = ref(false);

// Top-level sub-view for the Studio floor. Approval/Upcoming are the
// two plan-aware lenses on Studio drafts; Calendar/Inbox/Analytics
// fold the legacy standalone /social/{calendar,inbox,analytics} pages
// into Studio so the apps shell never remounts.
type StudioView = 'approval' | 'upcoming' | 'calendar' | 'inbox' | 'analytics';
const STUDIO_VIEW_KEYS: StudioView[] = ['approval', 'upcoming', 'calendar', 'inbox', 'analytics'];

// Lens options for the hero LensChip popover. P3.6 retired the iOS
// segmented control; this list now drives the chip's icon/label and
// the five-option chooser inside the popover. Order = popover render
// order (River first since it's the canvas's home lens).
const STUDIO_LENS_OPTIONS: { key: StudioView; label: string; icon: string }[] = [
  { key: 'calendar', label: 'River', icon: 'lucide:waves' },
  { key: 'approval', label: 'Approval', icon: 'lucide:list-checks' },
  { key: 'upcoming', label: 'Upcoming', icon: 'lucide:calendar-clock' },
  { key: 'inbox', label: 'Inbox', icon: 'lucide:inbox' },
  { key: 'analytics', label: 'Analytics', icon: 'lucide:bar-chart-2' },
];

const route = useRoute();
const router = useRouter();
const initialView: StudioView = STUDIO_VIEW_KEYS.includes(route.query.view as StudioView)
  ? (route.query.view as StudioView)
  : 'approval';
const view = ref<StudioView>(initialView);

// ── Composition Canvas (P3 — always on after P3.5) ───────────────
// The depth-zoom canvas wraps the entire Studio body unconditionally.
// `<RiverSurface>` lifts leaves into z=2 and the kind-chooser popover
// below mints z=3 composers in create mode. The `?canvas=` query-string
// gate from P3.1–P3.4 was retired in P3.5; any stale `?canvas=0/1` URLs
// are silently ignored.
const zoom = useCompositionZoom();
// The `lens` axis the canvas exposes is the existing StudioView — same
// five keys, same URL contract (`?view=` keeps working). Phase 3.6 will
// lift the segmented control entirely.
const canvasLens = computed(() => view.value);

/**
 * Canvas composer saved a post. Update the in-memory list so the river
 * leaf re-renders with the new caption / schedule / variants — no full
 * refetch needed. The selectedPost ref (legacy bottom-sheet detail) gets
 * the same treatment in case the user re-opens it later.
 */
function onCanvasPostUpdated(post: SocialPost) {
  const idx = posts.value.findIndex((p) => p.id === post.id);
  if (idx >= 0) posts.value[idx] = post;
  if (selectedPost.value?.id === post.id) selectedPost.value = post;
}

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

// Reflect `view` in the URL so deep-links from /social land on the
// matching sub-view.
watch(view, (next) => {
  const current = (route.query.view as string | undefined) ?? 'approval';
  if (current === next) return;
  const query: Record<string, any> = {
    ...route.query,
    view: next === 'approval' ? undefined : next,
  };
  // P4.4 Item D — picking a lens from the overview grid kicks the
  // user back to z=1 (River default). Drop the stale `z=0` param so
  // the URL settles cleanly. This rides with the view change so we
  // don't race the canvas's own writeUrl from setZ1().
  if (query.z === '0') delete query.z;
  router.replace({ query });
});
// Sync the other direction too — back/forward navigation should flip the toggle.
watch(() => route.query.view, (qv) => {
  const next: StudioView = STUDIO_VIEW_KEYS.includes(qv as StudioView)
    ? (qv as StudioView)
    : 'approval';
  if (view.value !== next) view.value = next;
});

// Plan slide-over opener — still backed by useAppSlideOver since plans
// remain a slide-over panel (only the compose slide-over was retired).
const planSlide = useAppSlideOver('social-plan');

// ── P3.4 — in-canvas + New chooser ────────────────────────────────
// Canvas mode replaces the slide-over hand-off with a two-option
// popover: social vs email. Each option drops the user straight into
// the matching composer at z=3 with an empty form. The popover's
// open state is driven by `v-model:open` on UPopover — Reka-UI's
// PopoverTrigger handles toggle on click.
const composeChooserOpen = ref(false);
function composeKind(kind: 'social' | 'email') {
  composeChooserOpen.value = false;
  zoom.compose(kind);
}

// ── P3.6 — Lens chip + popover (replaces segmented control) ───────
// The Studio hero now carries a "Lens: <current>" chip. Clicking it
// opens a five-option chooser that mutates `view` — the existing
// view↔URL watchers handle ?view= sync, so this is the only DOM
// affordance that changes lens. Same v-model:open + PopoverTrigger
// pattern as the compose chooser above.
const lensChooserOpen = ref(false);
function pickLens(next: StudioView) {
  lensChooserOpen.value = false;
  if (view.value === next) return;
  view.value = next;
}
const currentLens = computed(
  () => STUDIO_LENS_OPTIONS.find((o) => o.key === view.value) ?? STUDIO_LENS_OPTIONS[0]!,
);

// Composition Canvas wiring for `created` emits. The social river
// surface refetches on its own via a watch on `zoom.activeId` (see
// RiverSurface), so this handler just keeps the approval/upcoming
// in-memory `posts.value` list in sync when the user creates from
// those views. Email creates don't have an approval-view counterpart,
// so the touch-created handler is a no-op at the StudioSurface level.
function onCanvasPostCreated(post: SocialPost) {
  if (!posts.value.some((p) => p.id === post.id)) {
    posts.value = [post, ...posts.value];
  }
  // Refresh plans too, since the create may have minted a new Inbox plan
  // server-side for the org.
  fetchPlans();
}

function onCanvasTouchCreated(_comp: import('~~/shared/composition').EmailComposition) {
  // River refresh happens inside RiverSurface's zoom.activeId watcher.
  // Nothing approval/upcoming-shaped to update here.
}

// ── Content Plans ─────────────────────────────────────────────────
// Plans bundle a strategy + a batch of posts under a single review link
// (the monthly retainer + future campaign/launch concept). Listed at the
// top of Studio above the loose-drafts grouping.
const plans = ref<ContentPlanRecord[]>([]);
const plansLoading = ref(false);

async function fetchPlans() {
  plansLoading.value = true;
  try {
    const query: Record<string, string> = {};
    if (selectedClient.value && selectedClient.value !== 'org') {
      query.target_client = String(selectedClient.value);
    }
    const r = await $fetch<{ data: ContentPlanRecord[] }>('/api/social/plans', { query });
    plans.value = r?.data ?? [];
  } catch (err) {
    console.error('Studio fetchPlans failed', err);
    plans.value = [];
  } finally {
    plansLoading.value = false;
  }
}

const showNewPlan = ref(false);
const creatingPlan = ref(false);
const planForm = ref({
  project: '' as string,
  target_client: '' as string,
  plan_type: 'monthly_cadence' as 'monthly_cadence' | 'campaign' | 'launch' | 'custom',
  target_month: firstOfThisMonth(),
  objective: '',
});

function resetPlanForm() {
  planForm.value = {
    project: '',
    target_client: '',
    plan_type: 'monthly_cadence',
    target_month: firstOfThisMonth(),
    objective: '',
  };
}

async function createPlan() {
  creatingPlan.value = true;
  try {
    const body: Record<string, unknown> = {
      plan_type: planForm.value.plan_type,
    };
    if (planForm.value.project) body.project = planForm.value.project;
    if (planForm.value.target_client) body.target_client = planForm.value.target_client;
    if (planForm.value.plan_type === 'monthly_cadence' && planForm.value.target_month) {
      body.target_month = planForm.value.target_month;
    }
    if (planForm.value.objective) body.objective = planForm.value.objective;

    const r = await $fetch<{ data: ContentPlanRecord }>('/api/social/plans', {
      method: 'POST',
      body,
    });
    showNewPlan.value = false;
    resetPlanForm();
    if (r?.data?.id) {
      // Open the new plan as a slide-over panel rather than punching out to
      // /social/plans/[id] — keeps the user inside the apps shell with the
      // Framework7 iOS push animation. Also refresh the plan grid so the new
      // plan appears in the list under the panel.
      await fetchPlans();
      planSlide.open(r.data.id);
    } else {
      await fetchPlans();
    }
  } catch (err: any) {
    console.error('Studio createPlan failed', err);
    toast.add({
      title: 'Could not create plan',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    creatingPlan.value = false;
  }
}

// Cross-fill: same client/project sync as the draft form.
function syncPlanFromProject() {
  const f = planForm.value;
  const project = f.project ? projectsById.value.get(f.project) : null;
  const projectClientId = project?.client?.id || null;
  if (projectClientId && !f.target_client) f.target_client = projectClientId;
}
function syncPlanFromClient() {
  const f = planForm.value;
  if (!f.project) return;
  const project = projectsById.value.get(f.project);
  const projectClientId = project?.client?.id || null;
  if (f.target_client && projectClientId && projectClientId !== f.target_client) {
    f.project = '';
  }
}
watch(() => planForm.value.project, syncPlanFromProject);
watch(() => planForm.value.target_client, syncPlanFromClient);

const planProjectOptions = computed(() =>
  buildProjectOptions(planForm.value.target_client || pageScopedClientId.value || null),
);

function planClientName(p: ContentPlanRecord): string | null {
  if (p.target_client) {
    const direct = clientsById.value.get(p.target_client)?.name;
    if (direct) return direct;
  }
  if (p.project) {
    const proj = projectsById.value.get(p.project);
    return proj?.client?.name || null;
  }
  return null;
}

function firstOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Detail drawer ─────────────────────────────────────────────────
const selectedPost = ref<SocialPost | null>(null);
const detailBusy = ref(false);

// Phase 6 — Publisher bridge UI. The picker is a `datetime-local` value
// (YYYY-MM-DDTHH:mm, no timezone). It rides along with the Approve
// transition, and on its own via Save Schedule once a post is approved.
const scheduleAt = ref<string>('');
const savingSchedule = ref(false);

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const hasPlatformTarget = computed(() => {
  const p = selectedPost.value?.platforms;
  return Array.isArray(p) && p.some((x) => !!x?.account_id);
});

const scheduledAtInFuture = computed(() => {
  const iso = selectedPost.value?.scheduled_at;
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > Date.now();
});

const showScheduleHint = computed(() => {
  const s = selectedPost.value?.approval_state;
  if (s !== 'approved') return false;
  if (selectedPost.value?.status === 'scheduled' || selectedPost.value?.status === 'published') return false;
  return !scheduledAtInFuture.value && hasPlatformTarget.value;
});

const showPickPlatformsHint = computed(() => {
  const s = selectedPost.value?.approval_state;
  if (s !== 'approved' && s !== 'in_review') return false;
  return !hasPlatformTarget.value;
});

const scheduleDirty = computed(() => {
  const current = toLocalDateTimeInput(selectedPost.value?.scheduled_at ?? null);
  return scheduleAt.value !== current;
});

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
  // Fall back to the first attached media when the Studio cover field
  // hasn't been set — older posts pre-date `design_image_url` but still
  // have something the user expects to see in the edit modal.
  const initialCover = post.design_image_url || (post.media_urls && post.media_urls[0]) || '';
  editForm.value = {
    caption: post.caption || '',
    post_type: (post.post_type as any) || 'image',
    project: post.project || '',
    target_client: post.target_client || '',
    design_image_url: initialCover,
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
    if (view.value === 'upcoming') {
      // Future-dated, publisher-scheduled posts. Bypass the approval-state
      // filter — the Upcoming queue is publisher-status driven.
      query.status = 'scheduled';
      query['scheduled_at[_gte]'] = new Date().toISOString();
      query.sort = 'scheduled_at';
    } else {
      if (stateFilter.value !== 'all') query.approval_state = stateFilter.value;
    }
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

// Re-fetch when the view toggle flips so the queue updates immediately.
watch(view, () => { fetchPosts(); });

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
// When a client is selected (form or page-level Client Selector),
// narrow the project list to that client's projects so the user can't
// accidentally cross-attach.
function buildProjectOptions(scopedClientId: string | null): { label: string; value: string }[] {
  const all = Array.from(projectsById.value.values());
  const filtered = scopedClientId
    ? all.filter((p) => p.client?.id === scopedClientId)
    : all;
  return filtered.map((p) => ({
    label: `${p.title}${p.client?.name ? ` — ${p.client.name}` : ''}`,
    value: p.id,
  }));
}

const pageScopedClientId = computed<string | null>(() => {
  const sel = selectedClient.value;
  return sel && sel !== 'org' ? sel : null;
});

const editProjectOptions = computed(() =>
  buildProjectOptions(editForm.value.target_client || pageScopedClientId.value || null),
);

const clientOptions = computed(() =>
  Array.from(clientsById.value.values()).map((c) => ({ label: c.name, value: c.id })),
);

// Cross-fill (edit form only): picking a project auto-populates the client
// when empty, and clears the project if a different client is picked.
function syncFormFromProject() {
  const f = editForm.value;
  const project = f.project ? projectsById.value.get(f.project) : null;
  const projectClientId = project?.client?.id || null;
  if (projectClientId && !f.target_client) {
    f.target_client = projectClientId;
  }
}

function syncFormFromClient() {
  const f = editForm.value;
  if (!f.project) return;
  const project = projectsById.value.get(f.project);
  const projectClientId = project?.client?.id || null;
  if (f.target_client && projectClientId && projectClientId !== f.target_client) {
    f.project = '';
  }
}

watch(() => editForm.value.project, syncFormFromProject);
watch(() => editForm.value.target_client, syncFormFromClient);

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

// Posts in the Approval view bucketed by their content_plan. Plans without
// posts still render (showing an empty state inside the card); posts with a
// dangling content_plan FK (shouldn't happen post-backfill) get a synthesized
// "Unattached" group so they're not silently dropped.
interface PlanBucket {
  plan: ContentPlanRecord | null;
  posts: SocialPost[];
}

const postsByPlan = computed<PlanBucket[]>(() => {
  const byId = new Map<number, SocialPost[]>();
  const orphans: SocialPost[] = [];
  for (const post of posts.value) {
    const pid = post.content_plan;
    if (pid == null) {
      orphans.push(post);
      continue;
    }
    const arr = byId.get(pid) ?? [];
    arr.push(post);
    byId.set(pid, arr);
  }
  const out: PlanBucket[] = plans.value.map((p) => ({ plan: p, posts: byId.get(p.id) ?? [] }));
  if (orphans.length) out.push({ plan: null, posts: orphans });
  return out;
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
    const body: Record<string, unknown> = { approval_state: next };
    // Roll any user-picked schedule into the Approve transition so the
    // Phase 6 bridge can flip post_status → scheduled in a single round-trip.
    if (next === 'approved' && scheduleDirty.value) {
      const iso = fromLocalDateTimeInput(scheduleAt.value);
      if (iso) body.scheduled_at = iso;
    }
    const r = await $fetch<{ data: SocialPost }>(`/api/social/posts/${post.id}`, {
      method: 'PATCH',
      body,
    });
    selectedPost.value = r?.data ?? null;
    if (selectedPost.value) scheduleAt.value = toLocalDateTimeInput(selectedPost.value.scheduled_at);
    // Refresh list in place
    const idx = posts.value.findIndex((p) => p.id === post.id);
    if (idx >= 0 && r?.data) posts.value[idx] = r.data;
    const promoted = r?.data?.status === 'scheduled' && next === 'approved';
    toast.add({
      title: promoted ? 'Approved & scheduled' : `Marked ${stateLabel(next)}`,
      icon: 'i-lucide-check',
      color: 'green',
    });
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

async function saveSchedule() {
  if (!selectedPost.value) return;
  const iso = fromLocalDateTimeInput(scheduleAt.value);
  if (!iso) {
    toast.add({ title: 'Pick a date and time', icon: 'i-lucide-alert-circle', color: 'yellow' });
    return;
  }
  savingSchedule.value = true;
  try {
    const r = await $fetch<{ data: SocialPost }>(`/api/social/posts/${selectedPost.value.id}`, {
      method: 'PATCH',
      body: { scheduled_at: iso },
    });
    if (r?.data) {
      selectedPost.value = r.data;
      scheduleAt.value = toLocalDateTimeInput(r.data.scheduled_at);
      const idx = posts.value.findIndex((p) => p.id === r.data.id);
      if (idx >= 0) posts.value[idx] = r.data;
    }
    const promoted = r?.data?.status === 'scheduled';
    toast.add({
      title: promoted ? 'Scheduled for publish' : 'Schedule updated',
      icon: 'i-lucide-calendar-check',
      color: 'green',
    });
  } catch (err: any) {
    console.error('Studio saveSchedule failed', err);
    toast.add({
      title: 'Could not save schedule',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    savingSchedule.value = false;
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
  scheduleAt.value = toLocalDateTimeInput(post.scheduled_at);
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

// ── Media picker (Directus Files) ─────────────────────────────────
// Single image per post: we take the first picked file's URL and
// write it into the edit form's design_image_url.
const showMediaPicker = ref(false);

function openMediaPicker() {
  showMediaPicker.value = true;
}

function onMediaPicked(picked: { url: string; type: 'image' | 'video' }[]) {
  const first = picked[0];
  showMediaPicker.value = false;
  if (!first) return;
  editForm.value.design_image_url = first.url;
}

function clearDesignImage() {
  editForm.value.design_image_url = '';
}

watch(stateFilter, fetchPosts);
watch(selectedClient, () => {
  if (loading.value) return;
  fetchPosts();
  fetchPlans();
});

onMounted(() => {
  fetchPosts();
  fetchProjects();
  fetchClients();
  fetchPlans();
});
</script>

<template>
  <div class="studio-shell">
    <!-- Hero strip — sets the Studio identity + at-a-glance summary -->
    <section class="studio-hero">
      <div class="studio-hero__main">
        <div class="studio-hero__icon">
          <Icon name="lucide:palette" class="w-6 h-6" />
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="studio-hero__title">Content Studio</h2>
          <p class="studio-hero__sub">
            <template v-if="currentClient && (currentClient as any).id !== 'org'">
              Scoped to <span class="font-medium text-foreground">{{ (currentClient as any).name }}</span>
            </template>
            <template v-else>
              Design social posts, share with clients for review, then publish.
            </template>
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <!-- Overview button — gesture-free way to reach the z=0
               lens-grid (P4.4 Item D). Sibling of the LensChip since
               both navigate the lens axis. Hides at z=0 (the grid is
               itself the affordance) and at z>=1.5 (composer territory).
               Kept out of the canvas's top-right because RiverSurface's
               own "New Post" control lives there — co-locating with the
               LensChip also makes the affordance more discoverable. -->
          <UiActionButton
            v-if="zoom.z.value >= 0.9 && zoom.z.value < 1.5"
            icon="lucide:layout-grid"
            aria-label="Open lens overview"
            @click="zoom.openOverview()"
          >
            Overview
          </UiActionButton>
          <!-- Lens chip — view selector. P3.6 retired the iOS segmented
               control; the chip is the only DOM affordance that mutates
               `view`. Reka-UI's PopoverTrigger handles the open toggle
               via attr-fall-through onto UiActionButton's root <button>;
               no explicit @click needed (the earlier workaround was
               causing a double-toggle that net-zero'd the popover open). -->
          <UPopover v-model:open="lensChooserOpen" :popper="{ placement: 'bottom-end' }">
            <UiActionButton :icon="currentLens.icon">
              <span>Lens: {{ currentLens.label }}</span>
              <Icon name="lucide:chevron-down" class="w-3 h-3 ml-0.5 -mr-0.5 opacity-70" />
            </UiActionButton>
            <template #panel>
              <div class="lens-chooser">
                <p class="lens-chooser__title">Switch lens</p>
                <button
                  v-for="opt in STUDIO_LENS_OPTIONS"
                  :key="opt.key"
                  type="button"
                  class="lens-chooser__option"
                  :class="{ 'lens-chooser__option--active': view === opt.key }"
                  @click="pickLens(opt.key)"
                >
                  <span class="lens-chooser__icon">
                    <Icon :name="opt.icon" class="w-4 h-4" />
                  </span>
                  <span class="lens-chooser__label">{{ opt.label }}</span>
                  <Icon
                    v-if="view === opt.key"
                    name="lucide:check"
                    class="lens-chooser__check"
                  />
                </button>
              </div>
            </template>
          </UPopover>
          <!-- Compose entry — kind-chooser popover (social vs email).
               Reka-UI's PopoverTrigger toggles the popover via attr-fall-
               through onto UiActionButton's root <button>; the earlier
               explicit @click handler caused a double-toggle that net-
               zero'd the open state. Drop it; v-model:open is the single
               source of truth. -->
          <UPopover v-model:open="composeChooserOpen" :popper="{ placement: 'bottom-end' }">
            <UiActionButton icon="lucide:pen-line" variant="primary">
              Compose
            </UiActionButton>
            <template #panel>
              <div class="compose-chooser">
                <p class="compose-chooser__title">What are you creating?</p>
                <button
                  type="button"
                  class="compose-chooser__option"
                  @click="composeKind('social')"
                >
                  <span class="compose-chooser__icon compose-chooser__icon--social">
                    <Icon name="lucide:images" class="w-4 h-4" />
                  </span>
                  <span class="flex-1 min-w-0 text-left">
                    <span class="compose-chooser__label">New social post</span>
                    <span class="compose-chooser__hint">Caption + media for one or more channels</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="compose-chooser__option"
                  @click="composeKind('email')"
                >
                  <span class="compose-chooser__icon compose-chooser__icon--email">
                    <Icon name="lucide:mail" class="w-4 h-4" />
                  </span>
                  <span class="flex-1 min-w-0 text-left">
                    <span class="compose-chooser__label">New email</span>
                    <span class="compose-chooser__hint">One-off broadcast to a contact segment</span>
                  </span>
                </button>
              </div>
            </template>
          </UPopover>
          <UiActionButton icon="lucide:calendar-plus" @click="showNewPlan = true">
            New Plan
          </UiActionButton>
        </div>
      </div>

      <div v-if="view === 'approval' || view === 'upcoming'" class="studio-hero__stats">
        <div class="studio-stat">
          <span class="studio-stat__label">Total</span>
          <span class="studio-stat__value">{{ totalPosts }}</span>
        </div>
        <div class="studio-stat studio-stat--draft">
          <span class="studio-stat__label">Drafts</span>
          <span class="studio-stat__value">{{ stateCounts.draft || 0 }}</span>
        </div>
        <div class="studio-stat studio-stat--review">
          <span class="studio-stat__label">In Review</span>
          <span class="studio-stat__value">{{ stateCounts.in_review || 0 }}</span>
        </div>
        <div class="studio-stat studio-stat--approved">
          <span class="studio-stat__label">Approved</span>
          <span class="studio-stat__value">{{ stateCounts.approved || 0 }}</span>
        </div>
        <div class="studio-stat studio-stat--published">
          <span class="studio-stat__label">Published</span>
          <span class="studio-stat__value">{{ stateCounts.published || 0 }}</span>
        </div>
      </div>
    </section>

    <!-- State pill tabs — only meaningful for the Approval Queue view -->
    <div v-if="view === 'approval'" class="studio-tabs" role="tablist" aria-label="Approval state filter">
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

    <!-- Surface body — always hosted inside <CompositionCanvas> (P3.5
         retired the `?canvas=` opt-in). The canvas overlays a lifted
         card at z=2 and the master-variant composer at z=3 on top of
         whichever view is active below. -->
    <CompositionCanvas
      :z="zoom.z.value"
      :lens="canvasLens"
      :active-id="zoom.activeId.value"
      :lens-options="STUDIO_LENS_OPTIONS"
      @post-updated="onCanvasPostUpdated"
      @post-created="onCanvasPostCreated"
      @touch-created="onCanvasTouchCreated"
      @update:lens="(k) => pickLens(k as StudioView)"
    >
    <!-- P4.4 Item D — overview lens-grid thumbnails. Each tile renders a
         live mini-version of its lens, scaled down + clipped by the
         canvas's tile frame. Mount-gating happens inside CompositionCanvas
         (only when z<=0.6), so these subtrees are inert when the user is
         not approaching the overview. -->
    <template #lens-thumb="{ lens: thumbLens }">
      <SocialRiverSurface v-if="thumbLens === 'calendar'" />
      <SocialInboxSurface v-else-if="thumbLens === 'inbox'" />
      <SocialAnalyticsSurface v-else-if="thumbLens === 'analytics'" />
      <div v-else-if="thumbLens === 'approval'" class="studio-thumb-grid">
        <template v-for="bucket in postsByPlan.slice(0, 4)" :key="bucket.plan?.id ?? 'orphan'">
          <PlanGridCard
            v-if="bucket.plan"
            :plan="bucket.plan"
            :posts="bucket.posts"
            :client-name="planClientName(bucket.plan)"
          />
        </template>
      </div>
      <div v-else-if="thumbLens === 'upcoming'" class="studio-thumb-grid">
        <StudioPostCard
          v-for="post in posts.slice(0, 8)"
          :key="post.id"
          :post="post"
        />
      </div>
    </template>
    <!-- Loading — only for the plan-aware views (approval/upcoming).
         Calendar/Inbox/Analytics surfaces below own their own loading UI. -->
    <div v-if="(view === 'approval' || view === 'upcoming') && loading && !plans.length" class="flex flex-col items-center justify-center py-24 gap-3">
      <span class="spinner-ios spinner-ios--xl" role="status" aria-label="Loading" />
      <p class="cg-text-child text-muted-foreground">Loading content…</p>
    </div>

    <!-- Empty: no plans at all -->
    <div v-else-if="view === 'approval' && !plans.length" class="studio-empty">
      <div class="studio-empty__mark">
        <Icon name="lucide:palette" class="w-9 h-9" />
      </div>
      <p class="text-base font-semibold text-foreground">Your studio is quiet</p>
      <ol class="studio-empty__steps">
        <li><span class="studio-empty__step-num">1</span>Create a plan to bundle a month's worth of posts</li>
        <li><span class="studio-empty__step-num">2</span>Add posts and watch the Instagram wall fill out</li>
        <li><span class="studio-empty__step-num">3</span>Share one review link with your client for approval</li>
      </ol>
      <UiActionButton icon="lucide:calendar-plus" variant="primary" @click="showNewPlan = true">
        Create your first plan
      </UiActionButton>
    </div>

    <!-- Plans grid — one card per plan, with a Swiper effect-cards stack of
         its posts inside. -->
    <div v-else-if="view === 'approval'" class="studio-plan-grid">
      <template v-for="bucket in postsByPlan" :key="bucket.plan?.id ?? 'orphans'">
        <PlanGridCard
          v-if="bucket.plan && (bucket.posts.length || stateFilter === 'all')"
          :plan="bucket.plan"
          :posts="bucket.posts"
          :client-name="planClientName(bucket.plan)"
          @open-post="openDetail"
        />
      </template>

      <!-- Unattached posts: only surfaces if there are any (post-backfill
           should be empty). No Swiper deck — just a plain grid of cards so
           they're not silently dropped. -->
      <article
        v-for="bucket in postsByPlan"
        v-show="!bucket.plan && bucket.posts.length"
        :key="`orphan-${bucket.plan?.id ?? 'orphans'}`"
        class="studio-plan-grid__orphan"
      >
        <header class="studio-plan-grid__orphan-header">
          <Icon name="lucide:alert-circle" class="w-3.5 h-3.5" />
          Unattached posts
          <span class="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {{ bucket.posts.length }}
          </span>
        </header>
        <div class="grid grid-cols-2 gap-3 p-4">
          <StudioPostCard
            v-for="post in bucket.posts"
            :key="post.id"
            :post="post"
            @click="openDetail"
          />
        </div>
      </article>
    </div>

    <!-- Upcoming Publish view — flat list of future-scheduled posts -->
    <div v-else-if="view === 'upcoming'" class="space-y-4">
      <div v-if="!posts.length" class="studio-empty">
        <div class="studio-empty__mark">
          <Icon name="lucide:calendar-clock" class="w-9 h-9" />
        </div>
        <p class="text-base font-semibold text-foreground">Nothing scheduled</p>
        <p class="text-sm text-muted-foreground/80 max-w-sm text-center">
          Approved posts with a future publish time and a connected platform will show up here.
        </p>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <button
          v-for="post in posts"
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
              <Icon name="lucide:image" class="w-9 h-9 text-muted-foreground/30" />
            </div>
            <span class="studio-card__state" :class="stateTone(post.approval_state)">
              {{ stateLabel(post.approval_state) }}
            </span>
          </div>
          <div class="studio-card__body">
            <p class="studio-card__caption">{{ post.caption || 'Untitled draft' }}</p>
            <p v-if="post.scheduled_at" class="text-[10px] text-muted-foreground mt-1 tabular-nums">
              {{ new Date(post.scheduled_at).toLocaleString() }}
            </p>
          </div>
        </button>
      </div>
    </div>

    <!-- Legacy /social/* page bodies folded into Studio. Each renders lazily —
         we don't mount the others until the user switches to them. -->
    <SocialRiverSurface v-else-if="view === 'calendar'" />
    <SocialInboxSurface v-else-if="view === 'inbox'" />
    <SocialAnalyticsSurface v-else-if="view === 'analytics'" />
    </CompositionCanvas>

    <!-- New Plan — iOS bottom sheet -->
    <AppsAppBottomSheet
      v-model="showNewPlan"
      title="New Content Plan"
      subtitle="Bundle a strategy + a month of posts under a single review link for your client."
    >
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3 min-w-0">
          <UFormGroup
            label="Project"
            description="Optional — anchors hour-pool reporting when this plan is part of a retainer."
            class="min-w-0"
          >
            <USelect
              v-model="planForm.project"
              :options="planProjectOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Pick a retainer project"
              class="w-full"
            />
          </UFormGroup>
          <UFormGroup label="Target Client" class="min-w-0">
            <USelect
              v-model="planForm.target_client"
              :options="clientOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Pick a client"
              class="w-full"
            />
          </UFormGroup>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormGroup label="Plan Type">
            <USelect
              v-model="planForm.plan_type"
              :options="[
                { label: 'Monthly Cadence', value: 'monthly_cadence' },
                { label: 'Campaign', value: 'campaign' },
                { label: 'Launch', value: 'launch' },
                { label: 'Custom', value: 'custom' },
              ]"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>
          <UFormGroup
            v-if="planForm.plan_type === 'monthly_cadence'"
            label="Target Month"
          >
            <UInput v-model="planForm.target_month" type="date" />
          </UFormGroup>
        </div>

        <UFormGroup
          label="Objective (optional)"
          description="One-line goal — you can fill this in later."
        >
          <UInput
            v-model="planForm.objective"
            placeholder="e.g. Drive RSVPs to launch event."
          />
        </UFormGroup>

        <div class="flex justify-end gap-2 pt-2">
          <UiActionButton @click="showNewPlan = false">Cancel</UiActionButton>
          <UiActionButton
            icon="lucide:arrow-right"
            variant="primary"
            :loading="creatingPlan"
            @click="createPlan"
          >
            Create &amp; Open
          </UiActionButton>
        </div>
      </div>
    </AppsAppBottomSheet>

    <!-- Detail — iOS bottom sheet (post drafts get the same chrome as the
         New Plan flow so the whole Studio interaction language is iOS). -->
    <AppsAppBottomSheet
      :model-value="!!selectedPost"
      :title="editing ? 'Edit Draft' : 'Content Draft'"
      :subtitle="selectedPost?.target_month ? formatYearMonth(selectedPost.target_month) : 'No target month'"
      @update:model-value="(v) => { if (!v) { selectedPost = null; editing = false } }"
    >
      <template v-if="selectedPost && !editing && !editLocked" #actions>
        <UiActionButton icon="lucide:pencil" @click="startEditing">Edit</UiActionButton>
      </template>

      <div v-if="selectedPost" class="space-y-4">
        <div class="flex items-center gap-2">
          <span class="studio-card__state" :class="stateTone(selectedPost.approval_state)">
            {{ stateLabel(selectedPost.approval_state) }}
          </span>
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

          <!-- Phase 6 publisher bridge: schedule picker + hint banners.
               Visible while a post is awaiting/under review (so Approve can
               carry the schedule) and after approval (so staff can update it
               without re-opening the rich composer). -->
          <div
            v-if="selectedPost.approval_state === 'in_review' || selectedPost.approval_state === 'approved'"
            class="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-xs font-semibold text-foreground">Schedule</p>
                <p class="text-[11px] text-muted-foreground">
                  {{
                    selectedPost.status === 'scheduled'
                      ? 'Queued for auto-publish.'
                      : 'Pick a future time to auto-publish on approval.'
                  }}
                </p>
              </div>
              <span
                v-if="selectedPost.status === 'scheduled'"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/30"
              >
                <Icon name="lucide:calendar-clock" class="w-3 h-3" />
                Scheduled
              </span>
            </div>
            <div class="flex flex-wrap items-end gap-2">
              <UInput
                v-model="scheduleAt"
                type="datetime-local"
                class="flex-1 min-w-[180px]"
              />
              <UiActionButton
                v-if="selectedPost.approval_state === 'approved' && scheduleDirty"
                icon="lucide:calendar-check"
                variant="primary"
                :loading="savingSchedule"
                @click="saveSchedule"
              >
                Save Schedule
              </UiActionButton>
            </div>

            <div
              v-if="showScheduleHint"
              class="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
            >
              Approved. Schedule a publish time to push live.
            </div>

            <div
              v-if="showPickPlatformsHint"
              class="rounded border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-800 dark:text-violet-200 flex items-center justify-between gap-2"
            >
              <span>No platforms picked yet — this stays a Studio draft until you wire one.</span>
              <NuxtLink
                :to="{ path: '/apps/marketing', query: { floor: 'studio', view: 'calendar', z: '3', id: selectedPost.id } }"
                class="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline shrink-0"
              >
                Pick platforms
                <Icon name="lucide:arrow-right" class="w-3 h-3" />
              </NuxtLink>
            </div>
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

          <div class="grid grid-cols-2 gap-3 min-w-0">
            <UFormGroup label="Project" class="min-w-0">
              <USelect
                v-model="editForm.project"
                :options="editProjectOptions"
                option-attribute="label"
                value-attribute="value"
                placeholder="Pick a project"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup label="Target Client" class="min-w-0">
              <USelect
                v-model="editForm.target_client"
                :options="clientOptions"
                option-attribute="label"
                value-attribute="value"
                placeholder="Pick a client"
                class="w-full"
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

          <UFormGroup
            label="Cover Image"
            description="The hero image clients see in their review surface — upload a mockup or pick from your media library."
          >
            <button
              v-if="!editForm.design_image_url"
              type="button"
              class="studio-image-empty"
              @click="openMediaPicker()"
            >
              <Icon name="lucide:image-plus" class="w-7 h-7 text-muted-foreground/60" />
              <span class="text-xs text-muted-foreground">Choose image or upload new</span>
            </button>
            <div v-else class="studio-image-preview">
              <img :src="editForm.design_image_url" alt="Cover preview" />
              <div class="studio-image-preview__actions">
                <button
                  type="button"
                  class="studio-image-preview__btn"
                  @click="openMediaPicker()"
                >
                  <Icon name="lucide:image" class="w-3.5 h-3.5" />
                  Replace
                </button>
                <button
                  type="button"
                  class="studio-image-preview__btn studio-image-preview__btn--danger"
                  @click="clearDesignImage()"
                >
                  <Icon name="lucide:x" class="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            </div>
          </UFormGroup>

          <UFormGroup
            label="Figma Frame URL"
            description="Link back to the source design frame so reviewers can see context."
          >
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
    </AppsAppBottomSheet>

    <!-- Media picker (Directus files) -->
    <SocialMediaFilePicker
      v-if="showMediaPicker"
      @picked="onMediaPicked"
      @close="showMediaPicker = false"
    />
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* P4.4 Item D — mini-render grid used inside the overview lens-tiles for
   approval + upcoming lenses. The tile wrapper in CompositionCanvas
   already scales the content down to 0.25, so this grid lays out at
   close-to-full visual density (4 cards visible at the lens's natural
   layout, just smaller). */
.studio-thumb-grid {
  @apply grid gap-3 p-3;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.studio-shell {
  --accent-h: var(--app-accent-h, 220);
  --accent-s: var(--app-accent-s, 10%);
  --accent-l: var(--app-accent-l, 48%);
}

.studio-hero {
  @apply mb-5 rounded-2xl border border-border bg-card
    px-5 py-4 space-y-4;
  background-image:
    radial-gradient(circle at 0% 0%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.08), transparent 45%),
    radial-gradient(circle at 100% 100%, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.05), transparent 50%);
}

.studio-hero__main {
  @apply flex items-center gap-3;
}

.studio-hero__icon {
  @apply w-10 h-10 rounded-full flex items-center justify-center shrink-0
    text-white;
  background: linear-gradient(
    135deg,
    hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 10%)),
    hsl(var(--accent-h) var(--accent-s) var(--accent-l))
  );
  box-shadow: 0 4px 14px -6px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.5);
}

.studio-hero__title {
  @apply text-base font-semibold text-foreground tracking-tight;
}

.studio-hero__sub {
  @apply text-xs text-muted-foreground mt-0.5;
}

.studio-hero__stats {
  @apply grid grid-cols-2 sm:grid-cols-5 gap-2;
}

.studio-stat {
  @apply flex items-baseline justify-between rounded-lg
    border border-border/70 bg-background/60 px-3 py-2;
}

.studio-stat__label {
  @apply text-[10px] uppercase tracking-wide text-muted-foreground;
}

.studio-stat__value {
  @apply text-base font-semibold text-foreground tabular-nums;
}

.studio-stat--draft .studio-stat__value { @apply text-muted-foreground; }
.studio-stat--review .studio-stat__value { @apply text-amber-600 dark:text-amber-400; }
.studio-stat--approved .studio-stat__value { @apply text-success; }
.studio-stat--published .studio-stat__value { @apply text-sky-600 dark:text-sky-400; }

.studio-empty {
  @apply flex flex-col items-center justify-center py-24 gap-4;
}

.studio-empty__mark {
  @apply w-16 h-16 rounded-2xl flex items-center justify-center
    text-muted-foreground/60 bg-muted/40 border border-border/60;
}

.studio-empty__steps {
  @apply text-sm text-muted-foreground/90 space-y-2 max-w-sm;
  list-style: none;
}

.studio-empty__steps li {
  @apply flex items-start gap-2.5 text-left;
}

.studio-empty__step-num {
  @apply flex shrink-0 items-center justify-center w-5 h-5 rounded-full
    bg-muted/70 text-[10px] font-semibold text-foreground/80 mt-0.5;
}

.studio-plan-grid {
  @apply grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4;
}

.studio-plan-grid__orphan {
  @apply rounded-2xl border border-border bg-card overflow-hidden;
}

.studio-plan-grid__orphan-header {
  @apply flex items-center gap-1.5 px-4 py-2.5 border-b border-border
    text-xs font-medium text-muted-foreground;
}

.studio-tabs {
  @apply mb-5 flex;
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

/* .studio-card* — styles live in StudioPostCard.vue (the unattached-posts
   grid and the PlanGridCard Swiper deck both consume it). */

.studio-image-empty {
  @apply flex flex-col items-center justify-center gap-2
    w-full aspect-[16/9] rounded-lg
    border-2 border-dashed border-border bg-muted/30
    text-muted-foreground hover:text-foreground
    hover:border-foreground/30 hover:bg-muted/50
    transition-colors;
}

.studio-image-preview {
  @apply relative w-full overflow-hidden rounded-lg
    border border-border bg-muted/30;
  aspect-ratio: 16 / 9;
}

.studio-image-preview img {
  @apply w-full h-full object-cover;
}

.studio-image-preview__actions {
  @apply absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5
    px-2 py-1.5 bg-gradient-to-t from-black/55 to-transparent;
}

.studio-image-preview__btn {
  @apply inline-flex items-center gap-1 h-6 px-2 rounded-md
    text-[11px] font-medium text-white bg-black/40 backdrop-blur-sm
    hover:bg-black/60 transition-colors;
}

.studio-image-preview__btn--danger {
  @apply hover:bg-rose-500/70;
}

/* ── P3.4 compose-chooser popover ───────────────────────────────────── */

.compose-chooser {
  @apply flex flex-col gap-1 min-w-[240px] p-1;
}

.compose-chooser__title {
  @apply px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wider
    text-muted-foreground;
}

.compose-chooser__option {
  @apply flex items-center gap-3 px-2.5 py-2 rounded-md
    hover:bg-muted/60 transition-colors text-left;
}

.compose-chooser__icon {
  @apply w-8 h-8 rounded-full flex items-center justify-center shrink-0
    text-white;
}

.compose-chooser__icon--social {
  background: linear-gradient(135deg, hsl(330 78% 60%), hsl(210 72% 50%));
}

.compose-chooser__icon--email {
  background: linear-gradient(135deg, hsl(270 55% 60%), hsl(270 55% 45%));
}

.compose-chooser__label {
  @apply block text-sm font-medium text-foreground;
}

.compose-chooser__hint {
  @apply block text-[11px] text-muted-foreground leading-tight mt-0.5;
}

/* ── P3.6 lens-chooser popover ──────────────────────────────────────── */

.lens-chooser {
  @apply flex flex-col gap-0.5 min-w-[200px] p-1;
}

.lens-chooser__title {
  @apply px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wider
    text-muted-foreground;
}

.lens-chooser__option {
  @apply flex items-center gap-2.5 px-2.5 py-1.5 rounded-md
    hover:bg-muted/60 transition-colors text-left;
}

.lens-chooser__option--active {
  @apply bg-muted/40;
}

.lens-chooser__icon {
  @apply w-7 h-7 rounded-full flex items-center justify-center shrink-0
    text-foreground/70 bg-muted/70;
}

/* Reka-UI teleports the popover panel outside `.studio-shell`, so the
   --accent-h/s/l vars scoped there don't resolve here. Use the global
   --primary token instead so the icon stays visible regardless of where
   the panel mounts in the DOM. */
.lens-chooser__option--active .lens-chooser__icon {
  @apply bg-primary text-primary-foreground;
  box-shadow: 0 2px 8px -4px hsl(var(--primary) / 0.55);
}

.lens-chooser__label {
  @apply text-sm font-medium text-foreground;
}

.lens-chooser__check {
  @apply ml-auto w-4 h-4 text-success;
}
</style>
