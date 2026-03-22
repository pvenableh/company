<script setup lang="ts">
/**
 * Social Media Calendar
 * /social/calendar
 *
 * Monthly calendar view of scheduled posts with:
 * - Client filtering
 * - Platform filtering
 * - Click to view/edit posts
 * - Drag to reschedule (future enhancement)
 */

import { CalendarDate, DateFormatter, getLocalTimeZone, today } from '@internationalized/date'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, addMonths, subMonths } from 'date-fns'
import type { SocialPost, SocialClient, SocialAccountPublic } from '~/types/social'

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})
useHead({ title: 'Social Calendar | Earnest' })

const toast = useToast()

// Current view date
const currentDate = ref(today(getLocalTimeZone()))
const currentMonth = computed(() => new Date(currentDate.value.year, currentDate.value.month - 1, 1))

// Filters
const selectedClientId = ref<string | null>(null)
const selectedPlatform = ref<string | null>(null)
const selectedStatus = ref<string | null>(null)

// Fetch data (lazy to avoid blocking page render on Directus errors)
const { data: clientsData } = useLazyFetch('/api/social/clients')
const { data: accountsData } = useLazyFetch('/api/social/accounts')

const clients = computed(() => ((clientsData.value as any)?.data || []) as SocialClient[])
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[])

// Fetch posts for current month range
const monthStart = computed(() => format(startOfMonth(currentMonth.value), 'yyyy-MM-dd'))
const monthEnd = computed(() => format(endOfMonth(currentMonth.value), 'yyyy-MM-dd'))

const { data: postsData, refresh: refreshPosts } = useLazyFetch('/api/social/posts', {
  query: {
    scheduled_after: computed(() => `${monthStart.value}T00:00:00Z`),
    scheduled_before: computed(() => `${monthEnd.value}T23:59:59Z`),
    limit: 100,
  },
  watch: [monthStart, monthEnd],
})

const posts = computed(() => ((postsData.value as any)?.data || []) as SocialPost[])

// Filter posts
const filteredPosts = computed(() => {
  let result = posts.value

  if (selectedClientId.value) {
    const clientAccountIds = accounts.value
      .filter((a) => a.client_id === selectedClientId.value)
      .map((a) => a.id)
    result = result.filter((p) =>
      p.platforms.some((t) => clientAccountIds.includes(t.account_id))
    )
  }

  if (selectedPlatform.value) {
    result = result.filter((p) =>
      p.platforms.some((t) => t.platform === selectedPlatform.value)
    )
  }

  if (selectedStatus.value) {
    result = result.filter((p) => p.status === selectedStatus.value)
  }

  return result
})

// Group posts by date
const postsByDate = computed(() => {
  const grouped: Record<string, SocialPost[]> = {}
  for (const post of filteredPosts.value) {
    const dateKey = format(parseISO(post.scheduled_at), 'yyyy-MM-dd')
    if (!grouped[dateKey]) grouped[dateKey] = []
    grouped[dateKey].push(post)
  }
  return grouped
})

// Calendar days
const calendarDays = computed(() => {
  const start = startOfMonth(currentMonth.value)
  const end = endOfMonth(currentMonth.value)
  const days = eachDayOfInterval({ start, end })

  // Pad start to Sunday
  const startDay = start.getDay()
  const padStart = Array(startDay).fill(null)

  // Pad end to Saturday
  const endDay = end.getDay()
  const padEnd = Array(6 - endDay).fill(null)

  return [...padStart, ...days, ...padEnd]
})

// Navigation
function previousMonth() {
  const prev = subMonths(currentMonth.value, 1)
  currentDate.value = new CalendarDate(prev.getFullYear(), prev.getMonth() + 1, 1)
}

function nextMonth() {
  const next = addMonths(currentMonth.value, 1)
  currentDate.value = new CalendarDate(next.getFullYear(), next.getMonth() + 1, 1)
}

function goToToday() {
  currentDate.value = today(getLocalTimeZone())
}

// Post actions
const selectedPost = ref<SocialPost | null>(null)
const showPostModal = ref(false)

function openPost(post: SocialPost) {
  selectedPost.value = post
  showPostModal.value = true
}

function getPostsForDay(date: Date) {
  const dateKey = format(date, 'yyyy-MM-dd')
  return postsByDate.value[dateKey] || []
}

function isToday(date: Date) {
  return isSameDay(date, new Date())
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  publishing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const platformIcons: Record<string, string> = {
  instagram: 'i-lucide-instagram',
  tiktok: 'i-lucide-music',
}

// Stats
const monthStats = computed(() => ({
  total: filteredPosts.value.length,
  scheduled: filteredPosts.value.filter((p) => p.status === 'scheduled').length,
  published: filteredPosts.value.filter((p) => p.status === 'published').length,
  failed: filteredPosts.value.filter((p) => p.status === 'failed').length,
}))

const df = new DateFormatter('en-US', { month: 'long', year: 'numeric' })
</script>

<template>
  <div class="p-6 lg:p-8 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-4">
        <UButton to="/social/dashboard" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Content Calendar</h1>
          <p class="text-gray-500 dark:text-gray-400 mt-0.5">
            {{ monthStats.total }} posts this month
          </p>
        </div>
      </div>
      <UButton to="/social/compose" icon="i-lucide-plus">New Post</UButton>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <USelectMenu
        v-model="selectedClientId"
        :options="[{ label: 'All Contacts', value: null }, ...clients.map((c) => ({ label: c.name, value: c.id }))]"
        value-attribute="value"
        option-attribute="label"
        placeholder="Filter by contact"
        class="w-40"
      />
      <USelectMenu
        v-model="selectedPlatform"
        :options="[
          { label: 'All Platforms', value: null },
          { label: 'Instagram', value: 'instagram' },
          { label: 'TikTok', value: 'tiktok' },
        ]"
        value-attribute="value"
        option-attribute="label"
        placeholder="Platform"
        class="w-36"
      />
      <USelectMenu
        v-model="selectedStatus"
        :options="[
          { label: 'All Status', value: null },
          { label: 'Scheduled', value: 'scheduled' },
          { label: 'Published', value: 'published' },
          { label: 'Draft', value: 'draft' },
          { label: 'Failed', value: 'failed' },
        ]"
        value-attribute="value"
        option-attribute="label"
        placeholder="Status"
        class="w-32"
      />

      <div class="flex-1" />

      <!-- Month Stats -->
      <div class="hidden lg:flex items-center gap-4 text-sm">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-blue-500" />
          {{ monthStats.scheduled }} scheduled
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-500" />
          {{ monthStats.published }} published
        </span>
        <span v-if="monthStats.failed > 0" class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-red-500" />
          {{ monthStats.failed }} failed
        </span>
      </div>
    </div>

    <!-- Calendar -->
    <UCard class="overflow-hidden">
      <!-- Calendar Header -->
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UButton variant="ghost" icon="i-lucide-chevron-left" size="sm" @click="previousMonth" />
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white min-w-[180px] text-center">
              {{ df.format(currentMonth) }}
            </h2>
            <UButton variant="ghost" icon="i-lucide-chevron-right" size="sm" @click="nextMonth" />
          </div>
          <UButton variant="ghost" size="sm" @click="goToToday">Today</UButton>
        </div>
      </template>

      <!-- Day Headers -->
      <div class="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        <div
          v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']"
          :key="day"
          class="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
        >
          {{ day }}
        </div>
      </div>

      <!-- Calendar Grid -->
      <div class="grid grid-cols-7">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          class="min-h-[120px] border-b border-r border-gray-100 dark:border-gray-800 p-1"
          :class="[
            !day && 'bg-gray-50 dark:bg-gray-900/50',
            day && isToday(day) && 'bg-blue-50/50 dark:bg-blue-900/10',
          ]"
        >
          <template v-if="day">
            <!-- Date Number -->
            <div class="flex items-center justify-between px-1 mb-1">
              <span
                class="text-sm font-medium"
                :class="isToday(day) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'"
              >
                {{ format(day, 'd') }}
              </span>
              <span v-if="getPostsForDay(day).length > 3" class="text-xs text-gray-400">
                +{{ getPostsForDay(day).length - 3 }}
              </span>
            </div>

            <!-- Posts -->
            <div class="space-y-1">
              <button
                v-for="post in getPostsForDay(day).slice(0, 3)"
                :key="post.id"
                @click="openPost(post)"
                class="w-full text-left px-1.5 py-1 rounded text-xs truncate transition-colors"
                :class="statusColors[post.status]"
              >
                <span class="flex items-center gap-1">
                  <UIcon
                    v-for="platform in [...new Set(post.platforms.map((p) => p.platform))]"
                    :key="platform"
                    :name="platformIcons[platform]"
                    class="w-3 h-3 flex-shrink-0"
                  />
                  <span class="truncate">{{ post.caption.slice(0, 25) }}</span>
                </span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </UCard>

    <!-- Post Detail Modal -->
    <UModal v-model="showPostModal" class="sm:max-w-xl">
      <UCard v-if="selectedPost">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UBadge :color="selectedPost.status === 'published' ? 'green' : selectedPost.status === 'failed' ? 'red' : 'blue'" variant="subtle">
                {{ selectedPost.status }}
              </UBadge>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ format(parseISO(selectedPost.scheduled_at), 'MMM d, yyyy • h:mm a') }}
              </span>
            </div>
            <UButton variant="ghost" icon="i-lucide-x" size="xs" @click="showPostModal = false" />
          </div>
        </template>

        <!-- Thumbnail -->
        <div v-if="selectedPost.thumbnail_url || selectedPost.media_urls?.length" class="mb-4">
          <img
            :src="selectedPost.thumbnail_url || selectedPost.media_urls[0]"
            :alt="selectedPost.caption"
            class="w-full h-48 object-cover rounded-lg"
          />
        </div>

        <!-- Caption -->
        <p class="text-gray-900 dark:text-white whitespace-pre-wrap mb-4">
          {{ selectedPost.caption }}
        </p>

        <!-- Target Accounts -->
        <div class="mb-4">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">Posting to</p>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="target in selectedPost.platforms"
              :key="target.account_id"
              class="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs"
            >
              <UIcon :name="platformIcons[target.platform]" class="w-3 h-3" />
              {{ target.account_name }}
            </div>
          </div>
        </div>

        <!-- Publish Results -->
        <div v-if="selectedPost.publish_results?.length" class="mb-4">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">Results</p>
          <div class="space-y-2">
            <div
              v-for="result in selectedPost.publish_results"
              :key="result.account_id"
              class="flex items-center justify-between text-sm"
            >
              <span class="flex items-center gap-2">
                <UIcon :name="platformIcons[result.platform]" class="w-4 h-4" />
                {{ result.account_id }}
              </span>
              <UBadge :color="result.success ? 'green' : 'red'" variant="subtle" size="xs">
                {{ result.success ? 'Published' : 'Failed' }}
              </UBadge>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-between">
            <UButton
              v-if="selectedPost.status === 'scheduled' || selectedPost.status === 'draft'"
              variant="soft"
              color="red"
              size="sm"
            >
              Delete
            </UButton>
            <div class="flex gap-2">
              <UButton
                v-if="selectedPost.status === 'scheduled' || selectedPost.status === 'draft'"
                variant="soft"
                size="sm"
                :to="`/social/posts/${selectedPost.id}/edit`"
              >
                Edit
              </UButton>
              <UButton size="sm" @click="showPostModal = false">Close</UButton>
            </div>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
