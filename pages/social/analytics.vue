<script setup lang="ts">
/**
 * Social Media Analytics Dashboard
 * /social/analytics
 *
 * Features:
 * - Account-level metrics
 * - Client filtering
 * - Date range picker
 * - Charts for followers, engagement, reach
 * - Top performing posts
 */

import { format, subDays, subWeeks, subMonths, startOfDay, endOfDay } from 'date-fns'
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'
import type { SocialClient, SocialAccountPublic, SocialAnalyticsSnapshot, InstagramMetrics, TikTokMetrics } from '~/types/social'

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})

// Date range
const dateRangePresets = [
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 14 days', value: '14d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
]
const selectedPreset = ref('30d')

const dateRange = computed(() => {
  const end = new Date()
  let start: Date

  switch (selectedPreset.value) {
    case '7d':
      start = subDays(end, 7)
      break
    case '14d':
      start = subDays(end, 14)
      break
    case '90d':
      start = subDays(end, 90)
      break
    default:
      start = subDays(end, 30)
  }

  return {
    start: format(startOfDay(start), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
    end: format(endOfDay(end), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
  }
})

// Filters
const selectedClientId = ref<string | null>(null)
const selectedAccountId = ref<string | null>(null)

// Fetch data (lazy to avoid blocking page render on Directus errors)
const { data: clientsData } = useLazyFetch('/api/social/clients')
const { data: accountsData } = useLazyFetch('/api/social/accounts')

const clients = computed(() => ((clientsData.value as any)?.data || []) as SocialClient[])
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[])

// Filter accounts by client
const filteredAccounts = computed(() => {
  if (!selectedClientId.value) return accounts.value
  return accounts.value.filter((a) => a.client_id === selectedClientId.value)
})

// When client changes, reset account selection
watch(selectedClientId, () => {
  selectedAccountId.value = null
})

// Fetch analytics for selected account or all accounts
const { data: analyticsData, pending: analyticsLoading } = useLazyFetch('/api/social/analytics', {
  query: {
    account_id: selectedAccountId,
    start_date: computed(() => dateRange.value.start),
    end_date: computed(() => dateRange.value.end),
  },
  watch: [selectedAccountId, dateRange],
})

// Derive analytics from real API data with safe defaults
const defaultAnalytics = {
  overview: {
    followers: { current: 0, change: 0, change_pct: 0 },
    reach: { total: 0, change_pct: 0 },
    impressions: { total: 0, change_pct: 0 },
    engagement_rate: { current: 0, change: 0 },
    posts_count: 0,
  },
  followerHistory: [] as { date: string; value: number }[],
  engagementHistory: [] as { date: string; value: number }[],
  topPosts: [] as { id: string; thumbnail_url: string; caption: string; platform: string; engagement: number; reach: number; posted_at: string }[],
  platformBreakdown: {} as Record<string, { followers: number; engagement_rate: number; posts: number }>,
}

const analytics = computed(() => {
  const apiData = analyticsData.value?.data as any
  if (!apiData) return defaultAnalytics

  // Map the API overview response to the display format
  const overview = apiData.overview || {}
  return {
    overview: {
      followers: {
        current: overview.total_followers ?? 0,
        change: 0,
        change_pct: 0,
      },
      reach: { total: overview.total_reach ?? 0, change_pct: 0 },
      impressions: { total: overview.total_impressions ?? 0, change_pct: 0 },
      engagement_rate: { current: overview.avg_engagement_rate ?? 0, change: 0 },
      posts_count: overview.total_accounts ?? 0,
    },
    followerHistory: [] as { date: string; value: number }[],
    engagementHistory: [] as { date: string; value: number }[],
    topPosts: [] as { id: string; thumbnail_url: string; caption: string; platform: string; engagement: number; reach: number; posted_at: string }[],
    platformBreakdown: (apiData.accounts || []).reduce((acc: Record<string, any>, a: any) => {
      const platform = a.platform || 'unknown'
      const metrics = a.metrics || {}
      acc[platform] = {
        followers: metrics.followers_count ?? metrics.follower_count ?? 0,
        engagement_rate: metrics.engagement_rate ?? 0,
        posts: metrics.media_count ?? metrics.video_count ?? 0,
      }
      return acc
    }, {}),
  }
})

// Format helpers
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function formatChange(change: number, suffix = ''): string {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change}${suffix}`
}

const platformIcons: Record<string, string> = {
  instagram: 'i-lucide-instagram',
  tiktok: 'i-lucide-music',
}
</script>

<template>
  <div class="p-6 lg:p-8 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-4">
        <UButton to="/social/dashboard" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p class="text-gray-500 dark:text-gray-400 mt-0.5">
            Track your social media performance
          </p>
        </div>
      </div>
    </div>

    <!-- Filters Row -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <USelectMenu
        v-model="selectedClientId"
        :options="[{ label: 'All Clients', value: null }, ...clients.map((c) => ({ label: c.name, value: c.id }))]"
        value-attribute="value"
        option-attribute="label"
        placeholder="Filter by client"
        class="w-40"
      />
      <USelectMenu
        v-model="selectedAccountId"
        :options="[{ label: 'All Accounts', value: null }, ...filteredAccounts.map((a) => ({ label: `${a.account_name} (${a.platform})`, value: a.id }))]"
        value-attribute="value"
        option-attribute="label"
        placeholder="Select account"
        class="w-52"
      />

      <div class="flex-1" />

      <!-- Date Range -->
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="selectedPreset"
          :options="dateRangePresets"
          value-attribute="value"
          option-attribute="label"
          class="w-36"
        />
      </div>
    </div>

    <!-- Overview Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <UCard>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Followers</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {{ formatNumber(analytics.overview.followers.current) }}
          </p>
          <p class="text-xs mt-1" :class="analytics.overview.followers.change >= 0 ? 'text-emerald-600' : 'text-red-600'">
            {{ formatChange(analytics.overview.followers.change) }}
            <span class="text-gray-400">({{ formatChange(analytics.overview.followers.change_pct, '%') }})</span>
          </p>
        </div>
      </UCard>

      <UCard>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Reach</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {{ formatNumber(analytics.overview.reach.total) }}
          </p>
          <p class="text-xs mt-1" :class="analytics.overview.reach.change_pct >= 0 ? 'text-emerald-600' : 'text-red-600'">
            {{ formatChange(analytics.overview.reach.change_pct, '%') }} vs previous
          </p>
        </div>
      </UCard>

      <UCard>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Impressions</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {{ formatNumber(analytics.overview.impressions.total) }}
          </p>
          <p class="text-xs mt-1" :class="analytics.overview.impressions.change_pct >= 0 ? 'text-emerald-600' : 'text-red-600'">
            {{ formatChange(analytics.overview.impressions.change_pct, '%') }} vs previous
          </p>
        </div>
      </UCard>

      <UCard>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Engagement Rate</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {{ analytics.overview.engagement_rate.current }}%
          </p>
          <p class="text-xs mt-1" :class="analytics.overview.engagement_rate.change >= 0 ? 'text-emerald-600' : 'text-red-600'">
            {{ formatChange(analytics.overview.engagement_rate.change, '%') }} vs previous
          </p>
        </div>
      </UCard>

      <UCard>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Posts</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {{ analytics.overview.posts_count }}
          </p>
          <p class="text-xs text-gray-400 mt-1">this period</p>
        </div>
      </UCard>
    </div>

    <div class="grid lg:grid-cols-3 gap-6 mb-6">
      <!-- Follower Growth Chart -->
      <UCard class="lg:col-span-2">
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Follower Growth</h3>
        </template>

        <div class="h-64 flex items-end justify-between gap-2 px-4">
          <div
            v-for="point in analytics.followerHistory"
            :key="point.date"
            class="flex-1 flex flex-col items-center gap-2"
          >
            <div
              class="w-full bg-primary rounded-t transition-all"
              :style="{ height: `${((point.value - 12000) / 500) * 100}%` }"
            />
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ format(new Date(point.date), 'M/d') }}
            </span>
          </div>
        </div>
      </UCard>

      <!-- Platform Breakdown -->
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Platform Breakdown</h3>
        </template>

        <div class="space-y-4">
          <div
            v-for="(data, platform) in analytics.platformBreakdown"
            :key="platform"
            class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon :name="platformIcons[platform]" class="w-4 h-4" />
              <span class="font-medium text-gray-900 dark:text-white capitalize">{{ platform }}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p class="text-gray-500 dark:text-gray-400">Followers</p>
                <p class="font-semibold text-gray-900 dark:text-white">{{ formatNumber(data.followers) }}</p>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400">Eng. Rate</p>
                <p class="font-semibold text-gray-900 dark:text-white">{{ data.engagement_rate }}%</p>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400">Posts</p>
                <p class="font-semibold text-gray-900 dark:text-white">{{ data.posts }}</p>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Top Performing Posts -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-gray-900 dark:text-white">Top Performing Posts</h3>
          <UButton variant="ghost" size="xs" trailing-icon="i-lucide-arrow-right">View All</UButton>
        </div>
      </template>

      <div class="grid md:grid-cols-3 gap-4">
        <div
          v-for="post in analytics.topPosts"
          :key="post.id"
          class="group cursor-pointer"
        >
          <div class="relative aspect-square rounded-lg overflow-hidden mb-3">
            <img
              :src="post.thumbnail_url"
              :alt="post.caption"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div class="absolute top-2 left-2">
              <div class="p-1.5 bg-black/50 backdrop-blur rounded-full">
                <UIcon :name="platformIcons[post.platform]" class="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
          <p class="text-sm text-gray-900 dark:text-white line-clamp-2 mb-2">
            {{ post.caption }}
          </p>
          <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-heart" class="w-3.5 h-3.5" />
              {{ formatNumber(post.engagement) }}
            </span>
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-eye" class="w-3.5 h-3.5" />
              {{ formatNumber(post.reach) }}
            </span>
            <span>{{ format(new Date(post.posted_at), 'MMM d') }}</span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Engagement Chart -->
    <UCard class="mt-6">
      <template #header>
        <h3 class="font-semibold text-gray-900 dark:text-white">Engagement Rate Trend</h3>
      </template>

      <div class="h-48 flex items-end justify-between gap-4 px-4">
        <div
          v-for="(point, index) in analytics.engagementHistory"
          :key="point.date"
          class="flex-1 flex flex-col items-center"
        >
          <div class="relative w-full flex justify-center mb-2">
            <div
              class="w-3 h-3 rounded-full bg-emerald-500 z-10"
            />
            <!-- Line to next point -->
            <svg
              v-if="index < analytics.engagementHistory.length - 1"
              class="absolute left-1/2 top-1.5 h-1 overflow-visible"
              :style="{ width: '100%' }"
            >
              <line
                x1="6"
                y1="0"
                x2="100%"
                y2="0"
                stroke="currentColor"
                stroke-width="2"
                class="text-emerald-300 dark:text-emerald-700"
              />
            </svg>
          </div>
          <div class="text-center">
            <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ point.value }}%</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ format(new Date(point.date), 'M/d') }}
            </p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
