<template>
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
        <UIcon :name="platformMeta[p].icon" class="w-3.5 h-3.5" />
        {{ platformMeta[p].label }}
      </button>
    </div>

    <!-- Active platform preview -->
    <div v-if="activeAccount" class="grid md:grid-cols-2 gap-6 items-start">
      <!-- LinkedIn -->
      <div v-if="active === 'linkedin'" class="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden max-w-md">
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
        <div v-if="firstImageUrl" class="border-t bg-gray-100">
          <img :src="firstImageUrl" class="w-full max-h-96 object-cover" />
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
        <img v-if="firstImageUrl" :src="firstImageUrl" class="w-full max-h-96 object-cover bg-gray-100" />
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

      <!-- Instagram -->
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
        <div class="aspect-square bg-gray-100 flex items-center justify-center">
          <img v-if="firstImageUrl" :src="firstImageUrl" class="w-full h-full object-cover" />
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
            <img v-if="firstImageUrl" :src="firstImageUrl" class="w-full mt-2 rounded-lg max-h-80 object-cover" />
          </div>
        </div>
        <div class="px-4 pb-3 pl-14 flex items-center gap-4 text-gray-500">
          <UIcon name="i-lucide-heart" class="w-4 h-4" />
          <UIcon name="i-lucide-message-circle" class="w-4 h-4" />
          <UIcon name="i-lucide-repeat-2" class="w-4 h-4" />
          <UIcon name="i-lucide-send" class="w-4 h-4" />
        </div>
      </div>

      <!-- TikTok -->
      <div v-else-if="active === 'tiktok'" class="rounded-lg border border-gray-200 bg-black overflow-hidden max-w-[280px] aspect-[9/16] relative">
        <img v-if="firstImageUrl" :src="firstImageUrl" class="absolute inset-0 w-full h-full object-cover" />
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
import type { SocialAccountPublic, SocialPlatform } from '~~/shared/social';

const props = defineProps<{
  caption: string;
  mediaUrls: string[];
  mediaTypes: ('image' | 'video')[];
  ctaUrl: string;
  ctaLabel: string;
  accounts: SocialAccountPublic[];
}>();

const platformMeta: Record<SocialPlatform, { label: string; icon: string }> = {
  linkedin: { label: 'LinkedIn', icon: 'i-lucide-linkedin' },
  facebook: { label: 'Facebook', icon: 'i-lucide-facebook' },
  instagram: { label: 'Instagram', icon: 'i-lucide-instagram' },
  threads: { label: 'Threads', icon: 'i-lucide-at-sign' },
  tiktok: { label: 'TikTok', icon: 'i-lucide-music' },
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

const firstImageUrl = computed(() => {
  for (let i = 0; i < props.mediaUrls.length; i++) {
    if (props.mediaTypes[i] === 'image') return props.mediaUrls[i];
  }
  return null;
});

const ctaHost = computed(() => {
  if (!props.ctaUrl) return '';
  try {
    return new URL(props.ctaUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
});

const displayCaption = computed(() => {
  if (!props.ctaUrl) return props.caption;
  const label = props.ctaLabel?.trim();
  const suffix = label ? `${label}: ${props.ctaUrl}` : props.ctaUrl;
  return `${props.caption}\n\n${suffix}`;
});
</script>
