<template>
  <!--
    COLOR-TOKEN CARVE-OUT (intentional — do NOT tokenize the preview cards):
    the LinkedIn/Facebook/Instagram/Threads/TikTok cards below are faithful
    replicas of each platform's real chrome (white cards, the IG pink→yellow
    brand-ring gradient, black TikTok, FB blue). Their raw gray/brand classes
    must stay FIXED so a preview always looks like the real platform and does
    NOT re-skin with the user's Earnest palette. The component's own chrome
    (the platform tabs above) is already tokenized; only the mocks are exempt.
  -->
  <div>
    <!-- Tabs -->
    <div class="flex flex-wrap gap-1.5 mb-4">
      <button
        v-for="p in availablePlatforms"
        :key="p"
        class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5"
        :class="active === p
          ? 'bg-foreground text-background border-foreground'
          : 'border-border bg-background hover:bg-muted'"
        @click="active = p"
      >
        <UIcon :name="platformMeta[p].icon" class="w-4 h-4 shrink-0" />
        {{ platformMeta[p].label }}
      </button>
    </div>

    <!-- Active platform preview -->
    <div v-if="activeAccount" class="grid md:grid-cols-2 gap-6 items-start">
      <!-- ─── Story (Instagram only) ──────────────────────────────────────── -->
      <div
        v-if="effectiveType === 'story' && active === 'instagram'"
        class="relative rounded-2xl overflow-hidden max-w-[280px] aspect-[9/16] bg-gradient-to-br from-pink-600 via-purple-700 to-yellow-500 shadow-lg"
      >
        <img
          v-if="firstMediaUrl && firstMediaType === 'image'"
          :src="firstMediaUrl"
          class="absolute inset-0 w-full h-full object-cover"
        />
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center text-white/60"
        >
          <UIcon :name="firstMediaType === 'video' ? 'i-lucide-video' : 'i-lucide-image'" class="w-12 h-12" />
        </div>

        <!-- Top bar: progress + avatar -->
        <div class="absolute top-0 inset-x-0 p-2.5">
          <div class="h-0.5 bg-white/30 rounded-full overflow-hidden">
            <div class="h-full w-1/3 bg-white" />
          </div>
          <div class="flex items-center gap-2 mt-2">
            <div class="w-7 h-7 rounded-full bg-white/40 overflow-hidden ring-2 ring-white">
              <img v-if="activeAccount.profile_picture_url" :src="activeAccount.profile_picture_url" class="w-full h-full object-cover" />
            </div>
            <span class="text-xs font-semibold text-white drop-shadow-md">
              {{ activeAccount.account_handle || activeAccount.account_name }}
            </span>
            <span class="text-xs text-white/70 drop-shadow-md">now</span>
          </div>
        </div>

        <!-- Caption pill — honors the IG variant if one is forked. -->
        <div v-if="activeCaption" class="absolute bottom-16 inset-x-3">
          <p class="text-xs text-white whitespace-pre-wrap line-clamp-3 drop-shadow-md">{{ activeCaption }}</p>
        </div>

        <div class="absolute bottom-3 inset-x-3 flex items-center gap-2">
          <div class="flex-1 px-3 py-1.5 rounded-full border border-white/40 text-white/70 text-xs">
            Send message
          </div>
          <UIcon name="i-lucide-heart" class="w-5 h-5 text-white" />
          <UIcon name="i-lucide-send" class="w-5 h-5 text-white" />
        </div>
      </div>

      <!-- ─── Reel (Instagram or TikTok) ──────────────────────────────────── -->
      <div
        v-else-if="effectiveType === 'reel' && (active === 'instagram' || active === 'tiktok')"
        class="relative rounded-xl overflow-hidden max-w-[280px] aspect-[9/16] bg-black shadow-lg"
      >
        <img
          v-if="firstMediaUrl && firstMediaType === 'image'"
          :src="firstMediaUrl"
          class="absolute inset-0 w-full h-full object-cover opacity-90"
        />
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center text-white/40"
        >
          <UIcon name="i-lucide-clapperboard" class="w-12 h-12" />
        </div>

        <!-- Reel chrome: top + bottom -->
        <div class="absolute top-3 left-3 text-white text-xs font-semibold drop-shadow-md flex items-center gap-1.5">
          <UIcon name="i-lucide-clapperboard" class="w-3.5 h-3.5" />
          {{ active === 'tiktok' ? 'TikTok' : 'Reels' }}
        </div>

        <div class="absolute right-2 bottom-24 flex flex-col items-center gap-3 text-white">
          <UIcon name="i-lucide-heart" class="w-6 h-6 drop-shadow-md" />
          <UIcon name="i-lucide-message-circle" class="w-6 h-6 drop-shadow-md" />
          <UIcon name="i-lucide-send" class="w-6 h-6 drop-shadow-md" />
          <UIcon name="i-lucide-bookmark" class="w-6 h-6 drop-shadow-md" />
        </div>

        <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent text-white">
          <p class="text-sm font-semibold">@{{ activeAccount.account_handle || activeAccount.account_name }}</p>
          <p class="text-xs whitespace-pre-wrap line-clamp-3 opacity-90 mt-0.5">{{ displayCaption }}</p>
        </div>
      </div>

      <!-- ─── Default: feed-style cards by platform ───────────────────────── -->
      <!-- LinkedIn -->
      <div v-else-if="active === 'linkedin'" class="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden max-w-md">
        <div class="px-4 pt-3 pb-2 flex items-start gap-2">
          <div class="w-12 h-12 rounded-full bg-gray-200 overflow-hidden shrink-0">
            <img v-if="activeAccount.profile_picture_url" :src="activeAccount.profile_picture_url" class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-gray-900 truncate">{{ activeAccount.account_name }}</p>
            <p class="text-xs text-gray-500 truncate">{{ activeAccount.account_handle ? '@' + activeAccount.account_handle : 'Now • 🌐' }}</p>
          </div>
          <span class="text-xs text-gray-400">•••</span>
        </div>
        <div class="px-4 pb-3 text-sm text-gray-900 whitespace-pre-wrap">{{ displayCaption }}</div>
        <SocialPostPreviewCarousel
          v-if="effectiveType === 'carousel' && mediaUrls.length > 1"
          :media-urls="mediaUrls"
          :media-types="mediaTypes"
          aspect="video"
        />
        <img v-else-if="firstMediaUrl && firstMediaType === 'image'" :src="firstMediaUrl" class="w-full max-h-96 object-cover bg-gray-100" />
        <div v-else-if="firstMediaUrl && firstMediaType === 'video'" class="bg-black aspect-video flex items-center justify-center">
          <UIcon name="i-lucide-play-circle" class="w-12 h-12 text-white/80" />
        </div>
        <div v-else-if="ctaUrl" class="mx-4 mb-3 mt-1 border rounded-md overflow-hidden">
          <div class="bg-gray-100 h-32 flex items-center justify-center">
            <UIcon name="i-lucide-link-2" class="w-8 h-8 text-gray-400" />
          </div>
          <div class="px-3 py-2 bg-white">
            <p class="text-[11px] uppercase text-gray-500 truncate">{{ ctaHost }}</p>
            <p class="text-sm font-semibold text-gray-900 truncate">{{ ctaLabel || 'Visit link' }}</p>
          </div>
        </div>
        <div class="px-4 py-2 border-t flex items-center gap-4 text-xs text-gray-600">
          <span class="flex items-center gap-1"><UIcon name="i-lucide-thumbs-up" class="w-3.5 h-3.5" />Like</span>
          <span class="flex items-center gap-1"><UIcon name="i-lucide-message-circle" class="w-3.5 h-3.5" />Comment</span>
          <span class="flex items-center gap-1"><UIcon name="i-lucide-repeat-2" class="w-3.5 h-3.5" />Repost</span>
          <span class="flex items-center gap-1"><UIcon name="i-lucide-send" class="w-3.5 h-3.5" />Send</span>
        </div>
      </div>

      <!-- Facebook -->
      <div v-else-if="active === 'facebook'" class="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden max-w-md">
        <div class="px-4 pt-3 pb-2 flex items-center gap-2">
          <div class="w-10 h-10 rounded-full bg-blue-100 overflow-hidden shrink-0">
            <img v-if="activeAccount.profile_picture_url" :src="activeAccount.profile_picture_url" class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-gray-900 truncate">{{ activeAccount.account_name }}</p>
            <p class="text-xs text-gray-500">Just now · 🌐</p>
          </div>
        </div>
        <div class="px-4 pb-3 text-sm text-gray-900 whitespace-pre-wrap">{{ displayCaption }}</div>
        <SocialPostPreviewCarousel
          v-if="effectiveType === 'carousel' && mediaUrls.length > 1"
          :media-urls="mediaUrls"
          :media-types="mediaTypes"
          aspect="video"
        />
        <img v-else-if="firstMediaUrl && firstMediaType === 'image'" :src="firstMediaUrl" class="w-full max-h-96 object-cover bg-gray-100" />
        <div v-else-if="firstMediaUrl && firstMediaType === 'video'" class="bg-black aspect-video flex items-center justify-center">
          <UIcon name="i-lucide-play-circle" class="w-12 h-12 text-white/80" />
        </div>
        <div v-else-if="ctaUrl" class="mx-3 mb-3 border rounded-md overflow-hidden">
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 h-32 flex items-center justify-center">
            <UIcon name="i-lucide-link-2" class="w-8 h-8 text-blue-400" />
          </div>
          <div class="px-3 py-2 bg-gray-50">
            <p class="text-[11px] uppercase text-gray-500 truncate">{{ ctaHost }}</p>
            <p class="text-sm font-semibold text-gray-900 truncate">{{ ctaLabel || 'Visit link' }}</p>
          </div>
        </div>
        <div class="px-4 py-2 border-t flex items-center justify-between text-xs text-gray-600">
          <span class="flex items-center gap-1"><UIcon name="i-lucide-thumbs-up" class="w-3.5 h-3.5" />Like</span>
          <span class="flex items-center gap-1"><UIcon name="i-lucide-message-circle" class="w-3.5 h-3.5" />Comment</span>
          <span class="flex items-center gap-1"><UIcon name="i-lucide-share-2" class="w-3.5 h-3.5" />Share</span>
        </div>
      </div>

      <!-- Instagram (feed-style — story/reel handled above) -->
      <div v-else-if="active === 'instagram'" class="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden max-w-sm">
        <div class="px-3 py-2 flex items-center gap-2 border-b">
          <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-yellow-500 p-0.5">
            <div class="w-full h-full rounded-full bg-white p-0.5">
              <div class="w-full h-full rounded-full bg-gray-200 overflow-hidden">
                <img v-if="activeAccount.profile_picture_url" :src="activeAccount.profile_picture_url" class="w-full h-full object-cover" />
              </div>
            </div>
          </div>
          <p class="text-sm font-semibold text-gray-900 flex-1 truncate">{{ activeAccount.account_handle || activeAccount.account_name }}</p>
          <span class="text-xs text-gray-400">•••</span>
        </div>
        <SocialPostPreviewCarousel
          v-if="effectiveType === 'carousel' && mediaUrls.length > 1"
          :media-urls="mediaUrls"
          :media-types="mediaTypes"
          aspect="square"
        />
        <div v-else class="aspect-square bg-gray-100 flex items-center justify-center">
          <img v-if="firstMediaUrl && firstMediaType === 'image'" :src="firstMediaUrl" class="w-full h-full object-cover" />
          <UIcon v-else-if="firstMediaUrl && firstMediaType === 'video'" name="i-lucide-play-circle" class="w-16 h-16 text-gray-400" />
          <UIcon v-else name="i-lucide-image" class="w-12 h-12 text-gray-300" />
        </div>
        <div class="px-3 py-2 flex items-center gap-3 text-gray-900">
          <UIcon name="i-lucide-heart" class="w-5 h-5" />
          <UIcon name="i-lucide-message-circle" class="w-5 h-5" />
          <UIcon name="i-lucide-send" class="w-5 h-5" />
          <UIcon name="i-lucide-bookmark" class="w-5 h-5 ml-auto" />
        </div>
        <div class="px-3 pb-3 text-sm text-gray-900">
          <span class="font-semibold mr-1">{{ activeAccount.account_handle || activeAccount.account_name }}</span>
          <span class="whitespace-pre-wrap">{{ displayCaption }}</span>
        </div>
        <p v-if="ctaUrl" class="px-3 pb-3 text-xs text-gray-500 italic">
          (Instagram doesn't make caption links clickable — link in bio: {{ ctaHost }})
        </p>
      </div>

      <!-- Threads -->
      <div v-else-if="active === 'threads'" class="rounded-lg border border-gray-200 bg-white shadow-sm max-w-md">
        <div class="px-4 pt-3 pb-1 flex items-start gap-2">
          <div class="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0">
            <img v-if="activeAccount.profile_picture_url" :src="activeAccount.profile_picture_url" class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2">
              <p class="text-sm font-semibold text-gray-900 truncate">{{ activeAccount.account_handle || activeAccount.account_name }}</p>
              <span class="text-xs text-gray-400">now</span>
            </div>
            <div class="text-sm text-gray-900 whitespace-pre-wrap mt-0.5">{{ displayCaption }}</div>
            <SocialPostPreviewCarousel
              v-if="effectiveType === 'carousel' && mediaUrls.length > 1"
              class="mt-2"
              :media-urls="mediaUrls"
              :media-types="mediaTypes"
              aspect="square"
              rounded
            />
            <img v-else-if="firstMediaUrl && firstMediaType === 'image'" :src="firstMediaUrl" class="w-full mt-2 rounded-lg max-h-80 object-cover" />
            <div v-else-if="firstMediaUrl && firstMediaType === 'video'" class="bg-black mt-2 rounded-lg aspect-video flex items-center justify-center">
              <UIcon name="i-lucide-play-circle" class="w-10 h-10 text-white/80" />
            </div>
          </div>
        </div>
        <div class="px-4 pb-3 pl-14 flex items-center gap-4 text-gray-500">
          <UIcon name="i-lucide-heart" class="w-4 h-4" />
          <UIcon name="i-lucide-message-circle" class="w-4 h-4" />
          <UIcon name="i-lucide-repeat-2" class="w-4 h-4" />
          <UIcon name="i-lucide-send" class="w-4 h-4" />
        </div>
      </div>

      <!-- TikTok (always portrait — reel chrome handled above; this is the
           plain feed entry, kept for parity but rarely hit because TikTok
           posts default to reel) -->
      <div v-else-if="active === 'tiktok'" class="rounded-lg border border-gray-200 bg-black overflow-hidden max-w-[280px] aspect-[9/16] relative">
        <img v-if="firstMediaUrl && firstMediaType === 'image'" :src="firstMediaUrl" class="absolute inset-0 w-full h-full object-cover" />
        <div v-else class="absolute inset-0 flex items-center justify-center text-white/40">
          <UIcon name="i-lucide-video" class="w-12 h-12" />
        </div>
        <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent text-white">
          <p class="text-sm font-semibold">@{{ activeAccount.account_handle || activeAccount.account_name }}</p>
          <p class="text-xs whitespace-pre-wrap line-clamp-3 opacity-90">{{ displayCaption }}</p>
          <p v-if="ctaUrl" class="text-[10px] mt-1 opacity-70 italic">
            Caption links aren't clickable on TikTok.
          </p>
        </div>
        <div class="absolute right-2 bottom-20 flex flex-col items-center gap-3 text-white">
          <UIcon name="i-lucide-heart" class="w-6 h-6" />
          <UIcon name="i-lucide-message-circle" class="w-6 h-6" />
          <UIcon name="i-lucide-share-2" class="w-6 h-6" />
        </div>
      </div>

      <!-- Side: account list for active platform -->
      <div v-if="otherAccountsForActive.length > 0" class="space-y-2">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground">
          Also posting to {{ otherAccountsForActive.length }} other {{ platformMeta[active].label }} account{{ otherAccountsForActive.length !== 1 ? 's' : '' }}
        </p>
        <div class="space-y-1.5">
          <div
            v-for="a in otherAccountsForActive"
            :key="a.id"
            class="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <UAvatar :src="a.profile_picture_url || undefined" :alt="a.account_name" size="2xs" />
            <span class="truncate">{{ a.account_name }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SocialAccountPublic, SocialPlatform, PostType } from '~~/shared/social';

const props = defineProps<{
  caption: string;
  /** Per-platform caption variants from the master-variant composer.
   *  Absent key = the preview falls back to `caption`. */
  variants?: Partial<Record<SocialPlatform, string>>;
  mediaUrls: string[];
  mediaTypes: ('image' | 'video')[];
  ctaUrl: string;
  ctaLabel: string;
  accounts: SocialAccountPublic[];
  postType?: PostType;
}>();

import { getSocialPlatformIcon, getSocialPlatformLabel } from '~/utils/icons';

const platformMeta: Record<SocialPlatform, { label: string; icon: string }> = {
  linkedin: { label: getSocialPlatformLabel('linkedin'), icon: getSocialPlatformIcon('linkedin') },
  facebook: { label: getSocialPlatformLabel('facebook'), icon: getSocialPlatformIcon('facebook') },
  instagram: { label: getSocialPlatformLabel('instagram'), icon: getSocialPlatformIcon('instagram') },
  threads: { label: getSocialPlatformLabel('threads'), icon: getSocialPlatformIcon('threads') },
  tiktok: { label: getSocialPlatformLabel('tiktok'), icon: getSocialPlatformIcon('tiktok') },
};

const availablePlatforms = computed(() => {
  const set = new Set<SocialPlatform>();
  for (const a of props.accounts) set.add(a.platform);
  return Array.from(set);
});

const active = ref<SocialPlatform>('linkedin');
watchEffect(() => {
  if (availablePlatforms.value.length > 0 && !availablePlatforms.value.includes(active.value)) {
    active.value = availablePlatforms.value[0]!;
  }
});

const activeAccount = computed(() => props.accounts.find((a) => a.platform === active.value));
const otherAccountsForActive = computed(() =>
  props.accounts.filter((a) => a.platform === active.value && a.id !== activeAccount.value?.id),
);

// Per-platform effective type. Some types (story, reel) only render their
// chrome on platforms that support them — otherwise fall back to a feed post
// so users see *something* sensible per tab.
const effectiveType = computed<PostType>(() => {
  const t = props.postType || 'image';
  if (t === 'story' && active.value !== 'instagram') return 'image';
  if (t === 'reel' && active.value !== 'instagram' && active.value !== 'tiktok') return 'video';
  return t;
});

const firstMediaUrl = computed(() => props.mediaUrls[0] || null);
const firstMediaType = computed(() => props.mediaTypes[0] || 'image');

const ctaHost = computed(() => {
  if (!props.ctaUrl) return '';
  try {
    return new URL(props.ctaUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
});

/** The body that will actually publish to the active platform — variant when
 *  forked, master otherwise. The bare-caption refs above still point at
 *  `props.caption` for the Stories chrome (which always shows the master
 *  preview pill) — the platform-specific feed cards use this. */
const activeCaption = computed(() => {
  const v = props.variants?.[active.value];
  return typeof v === 'string' ? v : props.caption;
});

const displayCaption = computed(() => {
  if (!props.ctaUrl) return activeCaption.value;
  const label = props.ctaLabel?.trim();
  const suffix = label ? `${label}: ${props.ctaUrl}` : props.ctaUrl;
  return `${activeCaption.value}\n\n${suffix}`;
});
</script>
