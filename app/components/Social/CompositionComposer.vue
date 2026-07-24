<script setup lang="ts">
/**
 * CompositionComposer — the z=3 master-variant composer surface, rendered
 * in-place inside the Composition Canvas. Sole authoring surface for
 * social posts after P3.5 (the legacy slide-over composer and edit page
 * were retired).
 *
 * Authoring affordances: caption + per-platform variants + media +
 * schedule + platform picker. Reads and writes via the P3.0
 * `useComposition` adapter so the patch shape stays server-canonicalized
 * (variants collapse, scheduled_at normalization).
 *
 * Create mode (P3.4): when no `postId` is bound or the prop holds the
 * `compose:social` sentinel, the composer mounts with empty form
 * defaults. Save POSTs through `useComposition().create()` instead of
 * PATCH and emits `created` with the resulting SocialPost row.
 *
 * Motion: opacity + 1.04 → 1.0 scale entry, master spring. The canvas
 * host runs the crossfade against the lifted card; this component just
 * paints itself once it's mounted.
 *
 * @see app/composables/useComposition.ts — the adapter (P3.0).
 */
import { Icon } from '#components';
import { format, addHours, roundToNearestMinutes } from 'date-fns';
import draggable from 'vuedraggable';
import type {
  SocialAccountPublic,
  SocialPost,
  SocialPostTarget,
  PostType,
  SocialPlatform,
} from '~~/shared/social';
import { getSocialPlatformIcon } from '~/utils/icons';

const props = defineProps<{
  /** Active post id (canvas activeId). MUST match a row reachable via
   *  `useComposition.fetchById()` — OR the `compose:social` sentinel
   *  (P3.4 create mode) — OR null/undefined for plain create. */
  postId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', post: SocialPost): void;
  (e: 'created', post: SocialPost): void;
}>();

const toast = useToast();
const { fetchById, update, create } = useComposition();
const { selectedOrg } = useOrganization();

/** True when no real row exists yet. Drives save-button label + which
 *  endpoint we POST/PATCH against. */
const creating = computed(() =>
  !props.postId || props.postId.startsWith('compose:'),
);

// ── Server-side state ──────────────────────────────────────────────
// `loading` only flips true while a real id is being fetched. Create
// mode never sets it.
const loading = ref(false);
const original = ref<SocialPost | null>(null);
const fetchErr = ref<string | null>(null);

// ── Form state ─────────────────────────────────────────────────────
const caption = ref('');
const captionVariants = ref<Partial<Record<SocialPlatform, string>>>({});
const mediaUrls = ref<string[]>([]);
const mediaTypes = ref<('image' | 'video')[]>([]);
const selectedAccounts = ref<string[]>([]);
const scheduledAt = ref(
  format(roundToNearestMinutes(addHours(new Date(), 1), { nearestTo: 15 }), "yyyy-MM-dd'T'HH:mm"),
);
const isDraft = ref(false);
const { socialPublishingEnabled } = useSocialPublishing();
const ctaUrl = ref('');
const ctaLabel = ref('');
const linkedInVisibility = ref<'PUBLIC' | 'CONNECTIONS'>('PUBLIC');
const mediaInput = ref('');
const isSubmitting = ref(false);
const showFilePicker = ref(false);

const { data: accountsData } = useLazyFetch('/api/social/accounts');
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[]);

const accountGroups = computed(() => {
  const groups: { label: string; clientId: string | null; accounts: SocialAccountPublic[] }[] = [];
  const houseAccounts = accounts.value.filter((a) => !a.client);
  if (houseAccounts.length) groups.push({ label: 'House (agency-owned)', clientId: null, accounts: houseAccounts });

  const byClient = new Map<string, { name: string; accounts: SocialAccountPublic[] }>();
  for (const a of accounts.value) {
    if (!a.client) continue;
    if (!byClient.has(a.client)) byClient.set(a.client, { name: a.client_name || 'Unnamed Client', accounts: [] });
    byClient.get(a.client)!.accounts.push(a);
  }
  for (const [id, { name, accounts: list }] of byClient) {
    groups.push({ label: name, clientId: id, accounts: list });
  }
  return groups;
});

const selectedAccountDetails = computed(() =>
  accounts.value.filter((a) => selectedAccounts.value.includes(a.id)),
);

const selectedPlatforms = computed(() => {
  const set = new Set<SocialPlatform>();
  for (const a of selectedAccountDetails.value) set.add(a.platform);
  return [...set];
});

const instagramSelected = computed(() => selectedPlatforms.value.includes('instagram'));
const linkedinSelected = computed(() => selectedPlatforms.value.includes('linkedin'));

const mediaItems = computed<{ url: string; type: 'image' | 'video' }[]>({
  get: () => mediaUrls.value.map((url, i) => ({ url, type: mediaTypes.value[i] || 'image' })),
  set: (next) => {
    mediaUrls.value = next.map((it) => it.url);
    mediaTypes.value = next.map((it) => it.type);
  },
});

// ── Load row ───────────────────────────────────────────────────────
async function loadPost(id: string) {
  loading.value = true;
  fetchErr.value = null;
  try {
    const comp = await fetchById(id);
    if (!comp || comp.kind !== 'social') {
      throw new Error(comp ? 'Composition is not a social post' : 'Post not found');
    }
    // The view-model already strips Directus-flavored shape; the form
    // hydrates from the SocialPost row though, so fetch the raw row too
    // (single round-trip — adapter already did it under the hood, but
    // for the form we want the original target rows for re-emit).
    const rawRes = await $fetch<{ data: SocialPost }>(`/api/social/posts/${id}`, {
      credentials: 'include',
    });
    original.value = rawRes.data;
    caption.value = comp.body;
    captionVariants.value = (comp.variants ?? {}) as Partial<Record<SocialPlatform, string>>;
    mediaUrls.value = [...comp.media_urls];
    mediaTypes.value = [...comp.media_types];
    selectedAccounts.value = comp.targets.map((t) => t.account_id);
    ctaUrl.value = comp.cta_url ?? '';
    ctaLabel.value = comp.cta_label ?? '';
    isDraft.value = comp.status === 'draft';
    if (comp.scheduled_at) {
      const d = new Date(comp.scheduled_at);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        scheduledAt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    // Pull LinkedIn visibility off the original platform target options.
    const liTarget = comp.targets.find((t) => t.platform === 'linkedin');
    const liOpts = (liTarget?.raw?.options as { visibility?: 'PUBLIC' | 'CONNECTIONS' } | undefined);
    if (liOpts?.visibility) linkedInVisibility.value = liOpts.visibility;
  } catch (err: any) {
    fetchErr.value = err?.message || 'Could not load post';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.postId,
  (next) => {
    // Create mode (sentinel or absent) — no fetch. The form refs hold
    // empty defaults already.
    if (!next || next.startsWith('compose:')) {
      loading.value = false;
      return;
    }
    // Post-create swap: the canvas replaces `compose:social` with the
    // real UUID once create() returns. Skip the refetch when the id
    // matches the row we just minted — otherwise we'd race the POST
    // round-trip and clobber the user's form state.
    if (original.value?.id === next) return;
    loadPost(next);
  },
  { immediate: true },
);

// ── Char-limit guard ─────────────────────────────────────────────
function effectiveCaptionFor(p: SocialPlatform): string {
  const v = captionVariants.value[p];
  return typeof v === 'string' ? v : caption.value;
}

const captionWarning = computed<string | null>(() => {
  for (const p of selectedPlatforms.value) {
    const len = effectiveCaptionFor(p).length;
    if (p === 'instagram' && len > 2200) return 'Instagram captions max 2,200 characters';
    if (p === 'linkedin' && len > 3000) return 'LinkedIn posts max 3,000 characters';
    if (p === 'tiktok' && len > 4000) return 'TikTok captions max 4,000 characters';
    if (p === 'threads' && len > 500) return 'Threads posts max 500 characters';
  }
  return null;
});

const derivedPostType = computed<PostType>(() => {
  if (mediaUrls.value.length === 0) return 'text';
  if (mediaUrls.value.length > 1) return 'carousel';
  if (mediaTypes.value[0] === 'video') return 'reel';
  return 'image';
});

const canSubmit = computed(() => {
  if (creating.value && !selectedOrg.value) return false;
  const hasCaption = caption.value.trim().length > 0;
  const hasMedia = mediaUrls.value.length > 0;
  const hasAccounts = selectedAccounts.value.length > 0;
  const noWarning = !captionWarning.value;
  return hasCaption && (hasMedia || derivedPostType.value === 'text') && hasAccounts && noWarning;
});

// ── Media + accounts handlers ────────────────────────────────────
function addMedia() {
  if (!mediaInput.value.trim()) return;
  const url = mediaInput.value.trim();
  const isVideo = /\.(mp4|mov|webm|avi)$/i.test(url) || url.includes('video');
  mediaUrls.value.push(url);
  mediaTypes.value.push(isVideo ? 'video' : 'image');
  mediaInput.value = '';
}
function removeMedia(index: number) {
  mediaUrls.value.splice(index, 1);
  mediaTypes.value.splice(index, 1);
}
function toggleAccount(accountId: string) {
  const i = selectedAccounts.value.indexOf(accountId);
  if (i === -1) selectedAccounts.value.push(accountId);
  else selectedAccounts.value.splice(i, 1);
}
function onPickFiles(picked: { url: string; type: 'image' | 'video' }[]) {
  for (const f of picked) {
    mediaUrls.value.push(f.url);
    mediaTypes.value.push(f.type);
  }
  showFilePicker.value = false;
}

// ── AI trim (parity with the slide-over panel) ───────────────────
const PLATFORM_LIMIT: Record<SocialPlatform, number> = {
  instagram: 2200,
  linkedin: 3000,
  tiktok: 4000,
  threads: 500,
  facebook: 4000,
};
const trimming = ref(false);

// ── Draft with Earnest (generate a caption + per-platform variants) ──
// When every selected account belongs to one client, ground the draft in that
// client's brand; otherwise fall back to the org brand.
const draftClientId = computed<string | null>(() => {
  const ids = new Set(
    selectedAccountDetails.value.map((a) => a.client).filter(Boolean) as string[],
  );
  return ids.size === 1 ? [...ids][0]! : null;
});
const { generateSocialPosts } = useEarnestDraft();
const drafting = ref(false);
function draftCaptionText(post: { content: string; hashtags?: string[] }): string {
  const tags = Array.isArray(post.hashtags) && post.hashtags.length
    ? `\n\n${post.hashtags.join(' ')}`
    : '';
  return `${(post.content || '').trim()}${tags}`.trim();
}
async function handleRequestDraft(brief: string) {
  if (drafting.value) return;
  drafting.value = true;
  try {
    const posts = await generateSocialPosts({
      brief,
      platforms: selectedPlatforms.value,
      organizationId: selectedOrg.value ?? null,
      clientId: draftClientId.value,
    });
    if (!posts.length) {
      toast.add({ title: 'No draft returned', icon: 'i-lucide-alert-circle', color: 'yellow' });
      return;
    }
    // Master seeds from the first post; every selected platform keeps its own
    // tailored copy as a forked variant so later master edits don't clobber it.
    caption.value = draftCaptionText(posts[0]!);
    if (selectedPlatforms.value.length) {
      const next: Partial<Record<SocialPlatform, string>> = { ...captionVariants.value };
      for (const post of posts) {
        if (selectedPlatforms.value.includes(post.platform)) {
          next[post.platform] = draftCaptionText(post);
        }
      }
      captionVariants.value = next;
    }
    toast.add({
      title: 'Draft ready',
      description: selectedPlatforms.value.length
        ? `Master caption + ${selectedPlatforms.value.length} channel variant${selectedPlatforms.value.length > 1 ? 's' : ''}.`
        : 'Master caption drafted.',
      icon: 'i-lucide-sparkles',
      color: 'green',
    });
  } catch (err: any) {
    toast.add({
      title: 'Draft failed',
      description: err?.data?.message || 'Earnest could not draft this caption.',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    drafting.value = false;
  }
}

async function handleRequestTrim(lane: SocialPlatform | 'master') {
  if (trimming.value) return;
  let targetPlatform: SocialPlatform;
  let sourceText: string;
  if (lane === 'master') {
    if (selectedPlatforms.value.length === 0) return;
    targetPlatform = selectedPlatforms.value.reduce((tight, p) =>
      PLATFORM_LIMIT[p] < PLATFORM_LIMIT[tight] ? p : tight,
    );
    sourceText = caption.value;
  } else {
    targetPlatform = lane;
    sourceText = effectiveCaptionFor(lane);
  }
  trimming.value = true;
  try {
    const res: any = await $fetch('/api/social/ai-trim', {
      method: 'POST',
      body: {
        text: sourceText,
        platform: targetPlatform,
        target_chars: PLATFORM_LIMIT[targetPlatform],
        cta_url: ctaUrl.value.trim() || null,
        cta_label: ctaUrl.value.trim() ? (ctaLabel.value.trim() || null) : null,
      },
    });
    const trimmed: string = String(res?.caption || '').trim();
    if (!trimmed) {
      toast.add({
        title: 'No trim returned',
        icon: 'i-lucide-alert-circle',
        color: 'yellow',
      });
      return;
    }
    captionVariants.value = { ...captionVariants.value, [targetPlatform]: trimmed };
    toast.add({
      title: `Trimmed for ${targetPlatform}`,
      description: `Forked a ${trimmed.length}-char variant.`,
      icon: 'i-lucide-sparkles',
      color: 'green',
    });
  } catch (err: any) {
    toast.add({
      title: 'Trim failed',
      description: err?.data?.message || 'Earnest could not trim the caption.',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    trimming.value = false;
  }
}

// ── Save ─────────────────────────────────────────────────────────
function buildTargets() {
  return selectedAccountDetails.value.map((account) => ({
    kind: 'social_account' as const,
    platform: account.platform,
    account_id: account.id,
    account_name: account.account_name,
    raw: {
      platform: account.platform,
      account_id: account.id,
      account_name: account.account_name,
      options:
        account.platform === 'tiktok'
          ? {
              privacy_level: 'PUBLIC_TO_EVERYONE' as const,
              disable_duet: false,
              disable_stitch: false,
              disable_comment: false,
              post_mode: 'MEDIA_UPLOAD' as const,
            }
          : account.platform === 'linkedin'
            ? { visibility: linkedInVisibility.value }
            : undefined,
    } as SocialPostTarget,
  }));
}

async function save() {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  const scheduledISO = new Date(scheduledAt.value).toISOString();
  const status: 'draft' | 'scheduled' = isDraft.value ? 'draft' : 'scheduled';
  const variantsPayload = Object.keys(captionVariants.value).length
    ? captionVariants.value
    : null;
  const ctaUrlValue = ctaUrl.value.trim() || null;
  const ctaLabelValue = ctaUrlValue ? (ctaLabel.value.trim() || null) : null;
  try {
    if (creating.value) {
      // P3.4 create path — POST /api/social/posts. The endpoint
      // find-or-creates the org's Inbox plan when no content_plan FK
      // is set, so the new post lands somewhere visible.
      const orgId = selectedOrg.value;
      if (!orgId) throw new Error('No organization selected');
      const created = await create({
        kind: 'social',
        organization: orgId,
        body: caption.value,
        variants: variantsPayload,
        targets: buildTargets(),
        media_urls: mediaUrls.value,
        media_types: mediaTypes.value,
        post_type: derivedPostType.value,
        scheduled_at: scheduledISO,
        status,
        cta_url: ctaUrlValue,
        cta_label: ctaLabelValue,
        plan_id: null,
        project_id: null,
        thumbnail_url: null,
      });
      // Re-fetch the raw row so we can emit a SocialPost shape — the
      // canvas + the river both bind to that, not the view-model.
      const refreshed = await $fetch<{ data: SocialPost }>(`/api/social/posts/${created.id}`, {
        credentials: 'include',
      });
      if (refreshed?.data) {
        original.value = refreshed.data;
        emit('created', refreshed.data);
      }
      toast.add({
        title: status === 'scheduled' ? 'Post scheduled' : 'Draft created',
        icon: 'i-lucide-check-circle',
        color: 'green',
      });
      return;
    }
    if (!original.value) return;
    // Reuse the adapter — patch shape mirrors what `socialPatchBody`
    // expects. Server normalizes effective-master variants + auto-promotes
    // approval_state if needed (Phase 6 publisher bridge).
    await update(
      { type: 'social_post', post_id: original.value.id },
      {
        kind: 'social',
        body: caption.value,
        variants: variantsPayload,
        targets: buildTargets(),
        media_urls: mediaUrls.value,
        media_types: mediaTypes.value,
        post_type: derivedPostType.value,
        scheduled_at: scheduledISO,
        status,
        cta_url: ctaUrlValue,
        cta_label: ctaLabelValue,
      },
    );
    // Re-fetch the raw row so the river leaf updates in place (parent
    // SocialPost[] is keyed on id, so emitting `saved` lets the host
    // refresh the in-memory leaf rather than full refetch).
    const refreshed = await $fetch<{ data: SocialPost }>(`/api/social/posts/${original.value.id}`, {
      credentials: 'include',
    });
    if (refreshed?.data) emit('saved', refreshed.data);
    toast.add({
      title: isDraft.value ? 'Draft saved' : 'Post updated',
      icon: 'i-lucide-check-circle',
      color: 'green',
    });
  } catch (err: any) {
    toast.add({
      title: 'Could not save',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section
    class="composer-surface"
    role="dialog"
    aria-modal="false"
    aria-label="Edit composition"
    @click.stop
  >
    <header class="composer-surface__header">
      <div class="flex items-center gap-2 min-w-0">
        <button
          type="button"
          class="composer-surface__back"
          @click="emit('close')"
        >
          <Icon name="lucide:chevron-left" class="w-4 h-4" />
          <span>Back to lifted</span>
        </button>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <EButton
          @click="save"
          :loading="isSubmitting"
          :disabled="!canSubmit"
          size="sm"
          :icon="isDraft ? 'i-lucide-save' : 'i-lucide-calendar-clock'"
        >
          {{
            creating
              ? isDraft ? 'Create Draft' : (socialPublishingEnabled ? 'Create & Schedule' : 'Create & Plan')
              : isDraft ? 'Save Draft' : (socialPublishingEnabled ? 'Save & Schedule' : 'Save & Plan')
          }}
        </EButton>
      </div>
    </header>

    <div v-if="loading" class="composer-surface__loader">
      <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
      <p class="text-xs text-muted-foreground">Loading composition…</p>
    </div>

    <div v-else-if="fetchErr" class="composer-surface__error">
      <Icon name="lucide:alert-circle" class="w-6 h-6 text-rose-500" />
      <p class="text-sm text-foreground">{{ fetchErr }}</p>
      <EButton size="sm" variant="soft" @click="emit('close')">Close</EButton>
    </div>

    <div v-else class="composer-surface__body">
      <SocialMasterVariantComposer
        v-model:caption="caption"
        v-model:variants="captionVariants"
        :platforms="selectedPlatforms"
        :cta-url="ctaUrl"
        :cta-label="ctaLabel"
        :drafting="drafting"
        @request-trim="handleRequestTrim"
        @request-draft="handleRequestDraft"
      />

      <ECard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-foreground">Media</h2>
            <span v-if="derivedPostType === 'text'" class="text-xs text-muted-foreground">Optional — text-only post</span>
          </div>
        </template>

        <div v-if="mediaUrls.length > 0">
          <p
            v-if="mediaUrls.length > 1"
            class="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <Icon name="lucide:grip-vertical" class="w-3 h-3" />
            Drag to reorder — first slide is the cover image
          </p>
          <draggable
            v-model="mediaItems"
            item-key="url"
            class="grid grid-cols-3 gap-3 mb-4"
            handle=".composer-drag-handle"
            :animation="150"
          >
            <template #item="{ element, index }">
              <div class="relative aspect-square bg-muted rounded-lg overflow-hidden group">
                <img
                  v-if="element.type === 'image'"
                  :src="element.url"
                  :alt="`Media ${index + 1}`"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Icon name="lucide:video" class="w-8 h-8 text-muted-foreground" />
                </div>
                <div
                  v-if="mediaUrls.length > 1"
                  class="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 text-white text-[11px] font-semibold flex items-center justify-center backdrop-blur-sm"
                >
                  {{ index + 1 }}
                </div>
                <div
                  class="composer-drag-handle absolute inset-0 cursor-grab active:cursor-grabbing"
                  title="Drag to reorder"
                />
                <button
                  @click="removeMedia(index)"
                  class="absolute top-2 right-2 p-1 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <Icon name="lucide:x" class="w-4 h-4" />
                </button>
              </div>
            </template>
          </draggable>
        </div>

        <div class="flex gap-2">
          <EButton variant="soft" icon="i-lucide-folder-open" @click="showFilePicker = true">
            Choose from Files
          </EButton>
          <EInput v-model="mediaInput" placeholder="…or paste a media URL" class="flex-1" @keyup.enter="addMedia" />
          <EButton variant="ghost" @click="addMedia" icon="i-lucide-plus" :disabled="!mediaInput.trim()" />
        </div>
      </ECard>

      <ECard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-foreground">Add a Link</h2>
            <span class="text-xs text-muted-foreground">Optional</span>
          </div>
        </template>
        <div class="space-y-3">
          <EInput v-model="ctaUrl" type="url" placeholder="https://example.com/landing-page" />
          <EInput v-model="ctaLabel" placeholder='Short label (e.g. "Visit Website")' />
        </div>
      </ECard>

      <ECard v-if="linkedinSelected">
        <template #header>
          <div class="flex items-center gap-2">
            <Icon name="logos:linkedin-icon" class="w-4 h-4 shrink-0" />
            <h2 class="font-semibold text-foreground">LinkedIn Options</h2>
          </div>
        </template>
        <div class="flex gap-2">
          <EButton
            :variant="linkedInVisibility === 'PUBLIC' ? 'solid' : 'soft'"
            :color="linkedInVisibility === 'PUBLIC' ? 'primary' : 'gray'"
            size="sm"
            icon="i-lucide-globe"
            @click="linkedInVisibility = 'PUBLIC'"
          >
            Public
          </EButton>
          <EButton
            :variant="linkedInVisibility === 'CONNECTIONS' ? 'solid' : 'soft'"
            :color="linkedInVisibility === 'CONNECTIONS' ? 'primary' : 'gray'"
            size="sm"
            icon="i-lucide-users"
            @click="linkedInVisibility = 'CONNECTIONS'"
          >
            Connections Only
          </EButton>
        </div>
      </ECard>

      <ECard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-foreground">Post To</h2>
            <EBadge v-if="selectedAccounts.length > 0" color="primary" variant="subtle">
              {{ selectedAccounts.length }} selected
            </EBadge>
          </div>
        </template>
        <div v-if="accounts.length === 0" class="text-center py-4">
          <p class="text-sm text-muted-foreground">No accounts connected yet.</p>
        </div>
        <div v-else class="space-y-3 max-h-[260px] overflow-y-auto">
          <div v-for="group in accountGroups" :key="group.clientId ?? 'house'">
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">
              {{ group.label }}
            </p>
            <div class="space-y-1">
              <label
                v-for="account in group.accounts"
                :key="account.id"
                class="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                :class="
                  selectedAccounts.includes(account.id)
                    ? 'bg-primary/10'
                    : 'hover:bg-muted'
                "
              >
                <ECheckbox
                  :model-value="selectedAccounts.includes(account.id)"
                  @update:model-value="toggleAccount(account.id)"
                />
                <EAvatar
                  :src="account.profile_picture_url || undefined"
                  :alt="account.account_name"
                  :icon="account.profile_picture_url ? undefined : getSocialPlatformIcon(account.platform)"
                  size="xs"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-foreground truncate">
                    {{ account.account_name }}
                  </p>
                  <p class="text-xs text-muted-foreground truncate">
                    @{{ account.account_handle }}
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </ECard>

      <ECard>
        <template #header>
          <h2 class="font-semibold text-foreground">{{ socialPublishingEnabled ? 'Schedule' : 'Plan date' }}</h2>
        </template>
        <div class="space-y-3">
          <EInput v-model="scheduledAt" type="datetime-local" />
          <ECheckbox
            v-model="isDraft"
            :label="socialPublishingEnabled ? 'Save as draft (won\'t auto-publish)' : 'Save as draft (keep off the calendar)'"
          />
          <p v-if="!socialPublishingEnabled" class="text-[11px] text-muted-foreground">
            Live publishing is off — this date is an Earnest-only plan, not an auto-publish time.
          </p>
        </div>
      </ECard>

      <div v-if="selectedAccountDetails.length > 0">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Preview</h2>
        <SocialPostPreview
          :caption="caption"
          :variants="captionVariants"
          :media-urls="mediaUrls"
          :media-types="mediaTypes"
          :cta-url="ctaUrl"
          :cta-label="ctaLabel"
          :accounts="selectedAccountDetails"
          :post-type="derivedPostType"
        />
      </div>
    </div>

    <SocialMediaFilePicker
      v-if="showFilePicker"
      @close="showFilePicker = false"
      @picked="onPickFiles"
    />
  </section>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.composer-surface {
  @apply flex flex-col w-full max-w-3xl mx-auto rounded-2xl border border-border
    bg-card shadow-2xl overflow-hidden;
  max-height: min(86vh, 900px);
  will-change: transform, opacity;
}

.composer-surface__header {
  @apply flex items-center justify-between gap-3 px-4 py-3
    border-b border-border bg-card/95 backdrop-blur-md;
  position: sticky;
  top: 0;
  z-index: 1;
}

.composer-surface__back {
  @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full
    text-xs font-medium text-muted-foreground bg-muted/40
    hover:text-foreground hover:bg-muted transition-colors;
}

.composer-surface__loader,
.composer-surface__error {
  @apply flex flex-col items-center justify-center gap-3 py-16;
}

.composer-surface__body {
  @apply flex flex-col gap-5 px-4 py-5 overflow-y-auto;
}
</style>
