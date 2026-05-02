<script setup lang="ts">
/**
 * Social Media Dashboard
 * /social
 */

import { format, startOfWeek, endOfWeek, isToday } from 'date-fns'
import type { SocialPost, SocialAccountPublic, SocialDashboardStats, SocialPlatform } from '~~/shared/social'

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})
useHead({ title: 'Social Media | Earnest' })

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
    },
    engagement_rate_avg: 4.7,
    follower_growth_weekly: 248,
  }
})

const platformIcon = (platform?: string) => {
  return platform === 'instagram' ? 'i-lucide-instagram' : 'i-lucide-music'
}

const { getStatusColorName: statusColor } = useStatusStyle()
</script>

<template>
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
          to="/social/compose"
          icon="i-lucide-plus"
          size="lg"
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
          <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
          <span><strong class="text-foreground">Generate</strong> posts with AI tailored to your brand and audience</span>
        </div>
        <div class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
          <UIcon name="i-lucide-calendar-clock" class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <span><strong class="text-foreground">Schedule</strong> content across platforms from one calendar</span>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <UCard>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <UIcon name="i-lucide-calendar-clock" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Scheduled</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.total_scheduled }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
            <UIcon name="i-lucide-check-circle" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Published Today</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.published_today }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
            <UIcon name="i-lucide-trending-up" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Engagement</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.engagement_rate_avg }}%</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-pink-100 dark:bg-pink-900/30 rounded-xl">
            <UIcon name="i-lucide-users" class="w-6 h-6 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Followers</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">+{{ stats.follower_growth_weekly }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Upcoming Posts -->
      <div class="lg:col-span-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-gray-900 dark:text-white">Upcoming Posts</h2>
              <UButton
                to="/social/calendar"
                variant="ghost"
                size="sm"
                trailing-icon="i-lucide-arrow-right"
              >
                View Calendar
              </UButton>
            </div>
          </template>

          <div v-if="upcomingPosts.length === 0" class="text-center py-8">
            <UIcon name="i-lucide-calendar" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p class="text-gray-500 dark:text-gray-400">No scheduled posts</p>
            <UButton to="/social/compose" variant="soft" size="sm" class="mt-3">
              Create your first post
            </UButton>
          </div>

          <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
            <div
              v-for="post in upcomingPosts"
              :key="post.id"
              class="flex items-center gap-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-4 px-4 rounded-lg transition-colors cursor-pointer"
            >
              <!-- Thumbnail -->
              <div class="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                <img
                  v-if="post.thumbnail_url"
                  :src="post.thumbnail_url"
                  :alt="post.caption"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <UIcon :name="platformIcon(post.platforms[0]?.platform)" class="w-5 h-5 text-gray-400" />
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ post.caption.slice(0, 60) }}{{ post.caption.length > 60 ? '...' : '' }}
                </p>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ format(new Date(post.scheduled_at), 'MMM d, h:mm a') }}
                  </span>
                  <span class="text-gray-300 dark:text-gray-600">·</span>
                  <div class="flex items-center gap-1">
                    <UIcon
                      v-for="target in post.platforms"
                      :key="target.account_id"
                      :name="platformIcon(target.platform)"
                      class="w-3.5 h-3.5 text-gray-400"
                    />
                  </div>
                </div>
              </div>

              <!-- Status Badge -->
              <UBadge :color="statusColor(post.status)" variant="subtle" size="xs">
                {{ post.status }}
              </UBadge>
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
              to="/social/compose"
              block
              variant="soft"
              color="primary"
              icon="i-lucide-edit-3"
            >
              Create Post
            </UButton>
            <UButton
              block
              variant="soft"
              color="violet"
              icon="i-lucide-sparkles"
              @click="showAIWizard = true"
            >
              AI Generate
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
              to="/social/clients"
              block
              variant="soft"
              color="gray"
              icon="i-lucide-building-2"
            >
              Social Accounts
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
              <UAvatar
                :src="account.profile_picture_url || undefined"
                :alt="account.account_name"
                size="sm"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ account.account_name }}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <UIcon :name="platformIcon(account.platform)" class="w-3 h-3" />
                  @{{ account.account_handle }}
                </p>
              </div>
              <div
                class="w-2 h-2 rounded-full"
                :class="account.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'"
              />
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
</template>
