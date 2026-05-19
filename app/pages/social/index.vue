<script setup lang="ts">
/**
 * Social Media Dashboard
 * /social
 */

import { format, startOfWeek, endOfWeek, isToday } from 'date-fns'
import type { SocialPost, SocialAccountPublic, SocialDashboardStats, SocialPlatform } from '~~/shared/social'

definePageMeta({ layout: false, middleware: ['auth'] })
useHead({ title: 'Social Media | Earnest' })

// Apps-mode users get the apps shell so the page isn't orphaned from
// the AppRail. Classic mode keeps the original sidebar.
const { isAppsMode } = useAppsMode()
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'))

// "New Post" → slide-over composer in apps mode, /social/compose page
// in classic mode. The slide-over is the slim quick-post; the page is
// the full composer with AI Wizard, drag-reorder, per-platform options.
const composeSlide = useAppSlideOver('social-compose')
const router = useRouter()
function openComposer() {
  if (isAppsMode.value) {
    composeSlide.open('new')
  } else {
    router.push('/social/compose')
  }
}

const showAIWizard = ref(false)
const toast = useToast()

function handleAICreated(posts: { platform: SocialPlatform; caption: string }[]) {
  showAIWizard.value = false
  toast.add({
    title: `${posts.length} draft${posts.length !== 1 ? 's' : ''} created`,
    description: `AI-generated drafts for ${posts.map((p) => p.platform).join(', ')}`,
    icon: 'i-lucide-check-circle',
    color: 'green',
  })
  refreshNuxtData()
}

// Fetch data (lazy to avoid blocking page render on Directus errors)
const { data: accountsData } = useLazyFetch('/api/social/accounts')
const { data: postsData } = useLazyFetch('/api/social/posts', {
  query: { limit: 10, status: 'scheduled' },
})

const accounts = computed(() => (accountsData.value?.data || []) as SocialAccountPublic[])
const upcomingPosts = computed(() => (postsData.value?.data || []) as SocialPost[])

// Compute stats
const stats = computed<SocialDashboardStats>(() => {
  const today = new Date()
  const weekStart = startOfWeek(today)
  const weekEnd = endOfWeek(today)

  return {
    total_scheduled: upcomingPosts.value.length,
    published_today: 0, // TODO: fetch from API
    published_this_week: 0,
    failed_count: 0,
    accounts_by_platform: {
      instagram: accounts.value.filter((a) => a.platform === 'instagram').length,
      tiktok: accounts.value.filter((a) => a.platform === 'tiktok').length,
      linkedin: accounts.value.filter((a) => a.platform === 'linkedin').length,
      facebook: accounts.value.filter((a) => a.platform === 'facebook').length,
      threads: accounts.value.filter((a) => a.platform === 'threads').length,
    },
    engagement_rate_avg: 4.7,
    follower_growth_weekly: 248,
  }
})

import { getSocialPlatformIcon } from '~/utils/icons'
const platformIcon = (platform?: string) => getSocialPlatformIcon(platform)

const { getStatusColorName: statusColor } = useStatusStyle()
</script>

<template>
  <NuxtLayout :name="layout">
  <LayoutPageContainer>
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Social Media</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-1">
          Manage your Instagram and TikTok content
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          to="/social/settings"
          variant="ghost"
          icon="i-lucide-settings"
          size="sm"
        />
        <UButton
          icon="i-lucide-plus"
          size="lg"
          @click="openComposer"
        >
          New Post
        </UButton>
      </div>
    </div>

    <!-- Onboarding Banner (no accounts connected) -->
    <div v-if="accounts.length === 0" class="mb-8 p-6 bg-gradient-to-r from-pink-50 to-violet-50 dark:from-pink-900/20 dark:to-violet-900/20 rounded-2xl border border-pink-100 dark:border-pink-800/30">
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <div class="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <UIcon name="i-lucide-share-2" class="w-8 h-8 text-pink-500" />
        </div>
        <div class="flex-1">
          <h2 class="font-semibold text-gray-900 dark:text-white mb-1">Get started with Social Media</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">Connect your social accounts to start scheduling and publishing content with AI assistance.</p>
        </div>
        <div class="flex gap-2">
          <UButton to="/social/settings#setup-guide" variant="ghost" size="sm">Setup Guide</UButton>
          <UButton to="/social/settings" icon="i-lucide-plug" size="sm">Connect Accounts</UButton>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
          <UIcon name="i-lucide-plug" class="w-4 h-4 text-pink-500 shrink-0 mt-0.5" />
          <span><strong class="text-foreground">Connect</strong> your Instagram, TikTok, LinkedIn, or Facebook accounts</span>
        </div>
        <div class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
          <EarnestIcon class="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
          <span><strong class="text-foreground">Generate</strong> posts with Earnest tailored to your brand and audience</span>
        </div>
        <div class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
          <UIcon name="i-lucide-calendar-clock" class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <span><strong class="text-foreground">Schedule</strong> content across platforms from one calendar</span>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div class="ios-card p-5 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-calendar-clock" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-none">Scheduled</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white leading-none mt-1.5">{{ stats.total_scheduled }}</p>
        </div>
      </div>

      <div class="ios-card p-5 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-check-circle" class="w-6 h-6 text-success dark:text-success" />
        </div>
        <div>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-none">Published Today</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white leading-none mt-1.5">{{ stats.published_today }}</p>
        </div>
      </div>

      <div class="ios-card p-5 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-trending-up" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-none">Engagement</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white leading-none mt-1.5">{{ stats.engagement_rate_avg }}%</p>
        </div>
      </div>

      <div class="ios-card p-5 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-users" class="w-6 h-6 text-pink-600 dark:text-pink-400" />
        </div>
        <div>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-none">Followers</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white leading-none mt-1.5">+{{ stats.follower_growth_weekly }}</p>
        </div>
      </div>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Upcoming queue lives in Studio. This card is the entry point;
           the full grouped/project view renders at
           /apps/marketing?floor=studio&view=upcoming. -->
      <div class="lg:col-span-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-gray-900 dark:text-white">Upcoming Publish Queue</h2>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ upcomingPosts.length }} scheduled
              </span>
            </div>
          </template>

          <div class="flex items-start gap-4">
            <div class="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <UIcon name="i-lucide-calendar-clock" class="w-6 h-6 text-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white">
                Scheduled posts now live in Content Studio
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Grouped by project + month, with drag-to-reschedule and approval state side-by-side.
              </p>
              <UButton
                to="/apps/marketing?floor=studio&view=upcoming"
                variant="link"
                size="sm"
                trailing-icon="i-lucide-arrow-right"
                :padded="false"
                class="mt-2"
              >
                View upcoming in Studio
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Quick Actions -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
          </template>

          <div class="space-y-2">
            <UButton
              block
              variant="soft"
              color="primary"
              icon="i-lucide-edit-3"
              @click="openComposer"
            >
              Create Post
            </UButton>
            <UButton
              block
              variant="soft"
              color="violet"
              @click="showAIWizard = true"
            >
              <template #leading>
                <EarnestIcon class="w-3.5 h-3.5" />
              </template>
              Earnest Generate
            </UButton>
            <UButton
              to="/social/calendar"
              block
              variant="soft"
              color="gray"
              icon="i-lucide-calendar"
            >
              Content Calendar
            </UButton>
            <UButton
              to="/social/analytics"
              block
              variant="soft"
              color="gray"
              icon="i-lucide-bar-chart-2"
            >
              Analytics
            </UButton>
            <UButton
              to="/social/settings"
              block
              variant="soft"
              color="gray"
              icon="i-lucide-settings"
            >
              Settings
            </UButton>
          </div>
        </UCard>

        <!-- Connected Accounts -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-gray-900 dark:text-white">Accounts</h2>
              <UButton
                to="/social/settings"
                variant="ghost"
                size="xs"
                icon="i-lucide-plus"
              >
                Add
              </UButton>
            </div>
          </template>

          <div v-if="accounts.length === 0" class="text-center py-4">
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">No accounts connected</p>
            <UButton to="/social/settings" size="sm" variant="soft">
              Connect Account
            </UButton>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="account in accounts"
              :key="account.id"
              class="flex items-center gap-3"
            >
              <div class="relative shrink-0">
                <UAvatar
                  :src="account.profile_picture_url || undefined"
                  :alt="account.account_name"
                  :icon="account.profile_picture_url ? undefined : platformIcon(account.platform)"
                  size="sm"
                />
                <UIcon
                  v-if="account.profile_picture_url"
                  :name="platformIcon(account.platform)"
                  class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-sm bg-white dark:bg-gray-800 ring-1 ring-white dark:ring-gray-800"
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
              <div
                class="w-2 h-2 rounded-full"
                :class="account.status === 'active' ? 'bg-success' : 'bg-destructive'"
              ></div>
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- AI Social Wizard -->
    <SocialAISocialWizard
      v-if="showAIWizard"
      @close="showAIWizard = false"
      @created="handleAICreated"
    />
  </LayoutPageContainer>
  </NuxtLayout>
</template>
