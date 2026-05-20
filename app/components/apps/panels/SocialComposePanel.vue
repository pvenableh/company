<!--
  SocialComposePanel — full social composer as a slide-over.

  Replaces the old slim slide-over with the full /social/compose body
  (caption + media picker w/ drag-reorder + CTA + per-platform options +
  multi-account picker + previews + recommendations + AI wizard + post-now
  flow). Opens via:
    useAppSlideOver('social-compose').open('new')

  Query carry-through: the panel reads `?prefill_*` params on mount so
  legacy /social/compose?caption=…&account=… deep-links still pre-fill
  the form after the redirect lands here.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';
import { format, addHours, roundToNearestMinutes } from 'date-fns';
import draggable from 'vuedraggable';
import type { SocialAccountPublic, SocialPostTarget, PostType, SocialPlatform } from '~~/shared/social';
import { getSocialPlatformIcon } from '~/utils/icons';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const toast = useToast();
const route = useRoute();

const showAIWizard = ref(false);
const showPostNowConfirm = ref(false);
const showFilePicker = ref(false);
const aiSuggesting = ref(false);

function handleAICreated(generated: { platform: SocialPlatform; caption: string }[]) {
  showAIWizard.value = false;
  if (generated.length > 0 && generated[0]) {
    caption.value = generated[0].caption;
  }
  toast.add({
    title: 'AI content generated',
    description: `Created ${generated.length} draft post${generated.length !== 1 ? 's' : ''}`,
    icon: 'i-lucide-check-circle',
    color: 'green',
  });
}

const platformIcons = (p: SocialPlatform) => getSocialPlatformIcon(p);

const { data: accountsData } = useLazyFetch('/api/social/accounts');
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[]);

const caption = ref('');
const mediaUrls = ref<string[]>([]);
const mediaTypes = ref<('image' | 'video')[]>([]);
const selectedAccounts = ref<string[]>([]);
const scheduledAt = ref(
  format(roundToNearestMinutes(addHours(new Date(), 1), { nearestTo: 15 }), "yyyy-MM-dd'T'HH:mm"),
);
const isDraft = ref(false);
const ctaUrl = ref('');
const ctaLabel = ref('');
const linkedInVisibility = ref<'PUBLIC' | 'CONNECTIONS'>('PUBLIC');
const isSubmitting = ref(false);
const mediaInput = ref('');

// Apply prefill query params once on mount so the legacy compose redirect
// can carry context across.
onMounted(() => {
  const q = route.query;
  if (typeof q.caption === 'string') caption.value = q.caption;
  if (typeof q.account === 'string') {
    // Wait for accounts to populate, then preselect.
    const stop = watch(accounts, (list) => {
      if (list.some((a) => a.id === q.account)) {
        selectedAccounts.value = [q.account as string];
        stop();
      }
    }, { immediate: true });
  }
  if (typeof q.cta_url === 'string') ctaUrl.value = q.cta_url;
  if (typeof q.cta_label === 'string') ctaLabel.value = q.cta_label;
});

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
const inferredClient = computed(() => selectedAccountDetails.value[0]?.client ?? null);

function hasPlatformSelected(platform: SocialPlatform) {
  return selectedAccountDetails.value.some((a) => a.platform === platform);
}

const instagramSelected = computed(() => hasPlatformSelected('instagram'));
const tiktokSelected = computed(() => hasPlatformSelected('tiktok'));
const linkedinSelected = computed(() => hasPlatformSelected('linkedin'));
const threadsSelected = computed(() => hasPlatformSelected('threads'));

const selectedPlatforms = computed(() => {
  const set = new Set<SocialPlatform>();
  for (const a of selectedAccountDetails.value) set.add(a.platform);
  return [...set];
});

function askEarnestForSuggestions() {
  showAIWizard.value = true;
}

const captionLength = computed(() => caption.value.length);
const captionWarning = computed(() => {
  if (instagramSelected.value && captionLength.value > 2200) return 'Instagram captions max 2,200 characters';
  if (linkedinSelected.value && captionLength.value > 3000) return 'LinkedIn posts max 3,000 characters';
  if (tiktokSelected.value && captionLength.value > 4000) return 'TikTok captions max 4,000 characters';
  return null;
});
const captionLimit = computed(() => {
  if (instagramSelected.value) return '2,200';
  if (linkedinSelected.value) return '3,000';
  return '4,000';
});

const postAsStory = ref(false);
const storyEligible = computed(() =>
  instagramSelected.value &&
  mediaUrls.value.length === 1 &&
  (mediaTypes.value[0] === 'image' || mediaTypes.value[0] === 'video'),
);
const storyBlockReason = computed(() => {
  if (!instagramSelected.value) return 'Stories require an Instagram account';
  if (mediaUrls.value.length === 0) return 'Add 1 image or video';
  if (mediaUrls.value.length > 1) return 'Stories accept a single media item';
  return null;
});
watch(storyEligible, (eligible) => {
  if (!eligible && postAsStory.value) {
    postAsStory.value = false;
    toast.add({
      title: 'Switched off "Post as Story"',
      description: storyBlockReason.value || 'Story conditions no longer met',
      icon: 'i-lucide-alert-circle',
      color: 'amber',
    });
  }
});

const derivedPostType = computed<PostType>(() => {
  if (postAsStory.value && storyEligible.value) return 'story';
  if (mediaUrls.value.length === 0) return 'text';
  if (mediaUrls.value.length > 1) return 'carousel';
  if (mediaTypes.value[0] === 'video') return 'reel';
  return 'image';
});

const canSubmit = computed(() => {
  const hasCaption = caption.value.trim().length > 0;
  const hasMedia = mediaUrls.value.length > 0;
  const hasAccounts = selectedAccounts.value.length > 0;
  const noWarning = !captionWarning.value;
  return hasCaption && (hasMedia || derivedPostType.value === 'text') && hasAccounts && noWarning;
});

const minDateTime = computed(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));

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

const mediaItems = computed<{ url: string; type: 'image' | 'video' }[]>({
  get: () => mediaUrls.value.map((url, i) => ({ url, type: mediaTypes.value[i] || 'image' })),
  set: (next) => {
    mediaUrls.value = next.map((it) => it.url);
    mediaTypes.value = next.map((it) => it.type);
  },
});

function toggleAccount(accountId: string) {
  const index = selectedAccounts.value.indexOf(accountId);
  if (index === -1) selectedAccounts.value.push(accountId);
  else selectedAccounts.value.splice(index, 1);
}

function selectAllAccounts() {
  const allSelected = accounts.value.every((a) => selectedAccounts.value.includes(a.id));
  if (allSelected) selectedAccounts.value = [];
  else selectedAccounts.value = accounts.value.map((a) => a.id);
}

function buildPostBody(status: 'draft' | 'scheduled') {
  const platforms: SocialPostTarget[] = selectedAccountDetails.value.map((account) => ({
    platform: account.platform,
    account_id: account.id,
    account_name: account.account_name,
    options:
      account.platform === 'tiktok'
        ? {
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_stitch: false,
            disable_comment: false,
            post_mode: 'MEDIA_UPLOAD',
          }
        : account.platform === 'linkedin'
          ? { visibility: linkedInVisibility.value }
          : undefined,
  }));
  return {
    caption: caption.value,
    media_urls: mediaUrls.value,
    media_types: mediaTypes.value,
    platforms,
    post_type: derivedPostType.value,
    scheduled_at: new Date(scheduledAt.value).toISOString(),
    status,
    client: inferredClient.value,
    cta_url: ctaUrl.value.trim() || null,
    cta_label: ctaUrl.value.trim() ? (ctaLabel.value.trim() || null) : null,
  };
}

async function submitPost() {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  try {
    await $fetch('/api/social/posts', {
      method: 'POST',
      body: buildPostBody(isDraft.value ? 'draft' : 'scheduled'),
    });
    toast.add({
      title: isDraft.value ? 'Draft saved' : 'Post scheduled',
      description: isDraft.value
        ? 'Your post has been saved as a draft.'
        : `Scheduled for ${format(new Date(scheduledAt.value), 'MMM d, h:mm a')} to ${selectedAccounts.value.length} account(s)`,
      icon: 'i-lucide-check-circle',
      color: 'green',
    });
    emit('close');
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to create post',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function postNow() {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  showPostNowConfirm.value = false;
  try {
    const created: any = await $fetch('/api/social/posts', {
      method: 'POST',
      body: { ...buildPostBody('scheduled'), scheduled_at: new Date().toISOString() },
    });
    const postId = created?.data?.id;
    if (postId) {
      await $fetch(`/api/social/posts/${postId}/publish-now`, { method: 'POST' });
    }
    toast.add({
      title: 'Posting…',
      description: `Publishing to ${selectedAccounts.value.length} account(s) — refresh in a moment to see results.`,
      icon: 'i-lucide-send',
      color: 'green',
    });
    emit('close');
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to publish post',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    isSubmitting.value = false;
  }
}

function onPickFiles(picked: { url: string; type: 'image' | 'video' }[]) {
  for (const f of picked) {
    mediaUrls.value.push(f.url);
    mediaTypes.value.push(f.type);
  }
  showFilePicker.value = false;
}

const subtitle = computed(() => {
  const n = selectedAccounts.value.length;
  if (!n) return null;
  const platforms = new Set(selectedAccountDetails.value.map((a) => a.platform));
  return `${n} account${n === 1 ? '' : 's'} · ${[...platforms].join(', ')}`;
});
</script>

<template>
  <AppSlideOverShell title="New social post" :subtitle="subtitle" @close="emit('close')">
    <template #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title="Generate with Earnest"
        @click="showAIWizard = true"
      >
        <Icon name="lucide:sparkles" class="w-3 h-3" />
        Earnest Generate
      </button>
    </template>

    <div class="space-y-6">
      <!-- Caption -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Caption</h2>
            <span class="text-xs font-mono" :class="captionWarning ? 'text-destructive' : 'text-gray-400'">
              {{ captionLength }} / {{ captionLimit }}
            </span>
          </div>
        </template>
        <UTextarea v-model="caption" placeholder="Write your caption here..." :rows="6" autoresize class="w-full" />
        <p v-if="captionWarning" class="text-sm text-destructive mt-2">{{ captionWarning }}</p>
      </UCard>

      <!-- Media -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Media</h2>
            <span v-if="derivedPostType === 'text'" class="text-xs text-gray-400">Optional — text-only post</span>
          </div>
        </template>

        <div v-if="mediaUrls.length > 0">
          <p
            v-if="mediaUrls.length > 1"
            class="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <UIcon name="i-lucide-grip-vertical" class="w-3 h-3" />
            Drag to reorder — first slide is the cover image
          </p>
          <draggable
            v-model="mediaItems"
            item-key="url"
            class="grid grid-cols-3 gap-3 mb-4"
            handle=".drag-handle"
            :animation="150"
          >
            <template #item="{ element, index }">
              <div class="relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group">
                <img
                  v-if="element.type === 'image'"
                  :src="element.url"
                  :alt="`Media ${index + 1}`"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <UIcon name="i-lucide-video" class="w-8 h-8 text-gray-400" />
                </div>

                <div
                  v-if="mediaUrls.length > 1"
                  class="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 text-white text-[11px] font-semibold flex items-center justify-center backdrop-blur-sm"
                >
                  {{ index + 1 }}
                </div>

                <div
                  class="drag-handle absolute inset-0 cursor-grab active:cursor-grabbing"
                  title="Drag to reorder"
                />

                <button
                  @click="removeMedia(index)"
                  class="absolute top-2 right-2 p-1 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <UIcon name="i-lucide-x" class="w-4 h-4" />
                </button>
              </div>
            </template>
          </draggable>
        </div>

        <div class="flex gap-2">
          <UButton variant="soft" icon="i-lucide-folder-open" @click="showFilePicker = true">
            Choose from Files
          </UButton>
          <UInput v-model="mediaInput" placeholder="…or paste a media URL" class="flex-1" @keyup.enter="addMedia" />
          <UButton variant="ghost" @click="addMedia" icon="i-lucide-plus" :disabled="!mediaInput.trim()" />
        </div>
      </UCard>

      <!-- Link / Call to Action -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Add a Link</h2>
            <span class="text-xs text-gray-400">Optional</span>
          </div>
        </template>
        <div class="space-y-3">
          <UInput v-model="ctaUrl" type="url" placeholder="https://example.com/landing-page" />
          <UInput v-model="ctaLabel" placeholder='Short label (e.g. "Visit Website")' />
          <p class="text-xs text-muted-foreground">
            The URL is appended to the caption when the post publishes. LinkedIn, Facebook and Threads
            will fetch OG tags and render a link card automatically. Instagram and TikTok don't make
            caption links clickable — the URL is included for reference only.
          </p>
        </div>
      </UCard>

      <!-- Post destination — Story toggle -->
      <UCard v-if="instagramSelected">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Destination</h2>
            <span class="text-[10px] uppercase tracking-wider text-muted-foreground">
              {{ derivedPostType }}
            </span>
          </div>
        </template>
        <div class="flex items-start gap-3">
          <button
            type="button"
            role="switch"
            :aria-checked="postAsStory"
            :disabled="!storyEligible"
            class="relative inline-flex h-5 w-9 shrink-0 mt-0.5 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            :class="postAsStory ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-700'"
            @click="postAsStory = !postAsStory"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              :class="postAsStory ? 'translate-x-4' : 'translate-x-0'"
            />
          </button>
          <div class="flex-1 min-w-0">
            <label
              class="text-sm font-medium text-gray-900 dark:text-gray-100 select-none cursor-pointer"
              @click="storyEligible && (postAsStory = !postAsStory)"
            >
              Post as Instagram Story
            </label>
            <p v-if="storyBlockReason" class="text-xs text-warning dark:text-warning mt-0.5">
              {{ storyBlockReason }}
            </p>
            <p v-else-if="postAsStory" class="text-xs text-warning dark:text-warning mt-0.5 flex items-center gap-1">
              <UIcon name="i-lucide-clock" class="w-3 h-3" />
              Stories disappear from your profile after 24 hours.
            </p>
            <p v-else class="text-xs text-muted-foreground mt-0.5">
              Otherwise this posts to your feed as
              <span class="font-medium">{{ derivedPostType }}</span>.
            </p>
          </div>
        </div>
      </UCard>

      <!-- LinkedIn Options -->
      <UCard v-if="linkedinSelected">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="logos:linkedin-icon" class="w-4 h-4 rounded-sm shrink-0" />
            <h2 class="font-semibold text-gray-900 dark:text-white">LinkedIn Options</h2>
          </div>
        </template>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Visibility</label>
            <div class="flex gap-2">
              <UButton
                :variant="linkedInVisibility === 'PUBLIC' ? 'solid' : 'soft'"
                :color="linkedInVisibility === 'PUBLIC' ? 'primary' : 'gray'"
                size="sm"
                icon="i-lucide-globe"
                @click="linkedInVisibility = 'PUBLIC'"
              >
                Public
              </UButton>
              <UButton
                :variant="linkedInVisibility === 'CONNECTIONS' ? 'solid' : 'soft'"
                :color="linkedInVisibility === 'CONNECTIONS' ? 'primary' : 'gray'"
                size="sm"
                icon="i-lucide-users"
                @click="linkedInVisibility = 'CONNECTIONS'"
              >
                Connections Only
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Account Selection -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white">Post To</h2>
            <UBadge v-if="selectedAccounts.length > 0" color="primary" variant="subtle">
              {{ selectedAccounts.length }} selected
            </UBadge>
          </div>
        </template>

        <div v-if="accounts.length === 0" class="text-center py-4">
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
            No accounts connected yet.
          </p>
          <UButton to="/apps/marketing?floor=accounts&view=settings" size="sm" variant="soft">Connect Account</UButton>
        </div>

        <div v-else>
          <div class="flex items-center justify-end mb-2">
            <button
              @click="selectAllAccounts"
              class="text-xs text-primary hover:text-primary/85"
            >
              {{ accounts.every((a) => selectedAccounts.includes(a.id)) ? 'Deselect all' : 'Select all' }}
            </button>
          </div>
          <div class="space-y-3 max-h-[320px] overflow-y-auto">
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
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  "
                >
                  <UCheckbox
                    :model-value="selectedAccounts.includes(account.id)"
                    @update:model-value="toggleAccount(account.id)"
                  />
                  <div class="relative shrink-0">
                    <UAvatar
                      :src="account.profile_picture_url || undefined"
                      :alt="account.account_name"
                      :icon="account.profile_picture_url ? undefined : platformIcons(account.platform)"
                      size="xs"
                    />
                    <UIcon
                      v-if="account.profile_picture_url"
                      :name="platformIcons(account.platform)"
                      class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-sm bg-white dark:bg-gray-800 ring-1 ring-white dark:ring-gray-800"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {{ account.account_name }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                      @{{ account.account_handle }}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Earnest Recommendations -->
      <SocialPostRecommendations
        :caption="caption"
        :media-count="mediaUrls.length"
        :media-types="mediaTypes"
        :post-type="derivedPostType"
        :platforms="selectedPlatforms"
        :cta-url="ctaUrl"
        :cta-label="ctaLabel"
        :scheduled-at="scheduledAt"
        :ai-loading="aiSuggesting"
        @ai-recommend="askEarnestForSuggestions"
      />

      <!-- Schedule -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-gray-900 dark:text-white">Schedule</h2>
        </template>
        <div class="space-y-4">
          <UInput v-model="scheduledAt" type="datetime-local" :min="minDateTime" />
          <UCheckbox v-model="isDraft" label="Save as draft" />
        </div>
      </UCard>

      <!-- Platform Previews -->
      <div v-if="selectedAccountDetails.length > 0">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Preview</h2>
        <SocialPostPreview
          :caption="caption"
          :media-urls="mediaUrls"
          :media-types="mediaTypes"
          :cta-url="ctaUrl"
          :cta-label="ctaLabel"
          :accounts="selectedAccountDetails"
          :post-type="derivedPostType"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-muted-foreground">
          <span v-if="!isDraft && canSubmit">
            {{ selectedAccounts.length }} account{{ selectedAccounts.length !== 1 ? 's' : '' }} ·
            {{ format(new Date(scheduledAt), 'MMM d, h:mm a') }}
          </span>
        </span>
        <div class="flex items-center gap-2">
          <UButton
            v-if="!isDraft"
            @click="showPostNowConfirm = true"
            :disabled="!canSubmit || isSubmitting"
            size="sm"
            color="green"
            variant="soft"
            icon="i-lucide-send"
          >
            Post Now
          </UButton>
          <UButton
            @click="submitPost"
            :loading="isSubmitting"
            :disabled="!canSubmit"
            size="sm"
            :icon="isDraft ? 'i-lucide-save' : 'i-lucide-calendar-clock'"
          >
            {{ isDraft ? 'Save Draft' : 'Schedule' }}
          </UButton>
        </div>
      </div>
    </template>

    <!-- AI Social Wizard -->
    <SocialAISocialWizard
      v-if="showAIWizard"
      @close="showAIWizard = false"
      @created="handleAICreated"
    />

    <!-- File Picker -->
    <SocialMediaFilePicker
      v-if="showFilePicker"
      @close="showFilePicker = false"
      @picked="onPickFiles"
    />

    <!-- Post Now confirm -->
    <UModal v-model="showPostNowConfirm" class="sm:max-w-md">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-send" class="w-5 h-5 text-success" />
          <h3 class="font-semibold">Post immediately?</h3>
        </div>
      </template>

      <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
        This will publish to <strong>{{ selectedAccounts.length }} account{{ selectedAccounts.length !== 1 ? 's' : '' }}</strong> right now.
        You can't unpublish from inside Earnest — you'll need to delete from each platform directly if you change your mind.
      </p>
      <div v-if="selectedAccountDetails.length > 0" class="flex flex-wrap gap-1.5">
        <span
          v-for="a in selectedAccountDetails"
          :key="a.id"
          class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800"
        >
          <UIcon :name="platformIcons(a.platform)" class="w-3 h-3" />
          {{ a.account_name }}
        </span>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="showPostNowConfirm = false">Cancel</UButton>
          <UButton color="green" icon="i-lucide-send" :loading="isSubmitting" @click="postNow">
            Yes, Post Now
          </UButton>
        </div>
      </template>
    </UModal>
  </AppSlideOverShell>
</template>
