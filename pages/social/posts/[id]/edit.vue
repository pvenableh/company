<script setup lang="ts">
/**
 * Edit Scheduled Post
 * /social/posts/:id/edit
 */

import { format, parseISO } from 'date-fns'
import { CalendarDate, getLocalTimeZone, parseDate, today } from '@internationalized/date'
import type { SocialPost, SocialAccountPublic, SocialPostTarget, PostType } from '~/types/social'

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const postId = route.params.id as string

// Fetch post data
const { data: postData, error: postError } = await useFetch(`/api/social/posts/${postId}`)

if (postError.value || !postData.value?.data) {
  throw createError({ statusCode: 404, message: 'Post not found' })
}

const post = postData.value.data as SocialPost

// Fetch accounts
const { data: accountsData } = await useFetch('/api/social/accounts')
const accounts = computed(() => (accountsData.value?.data || []) as SocialAccountPublic[])

// Form state (initialized from post)
const caption = ref(post.caption)
const mediaUrls = ref([...post.media_urls])
const mediaTypes = ref([...post.media_types])
const selectedAccounts = ref(post.platforms.map((p) => p.account_id))
const postType = ref<PostType>(post.post_type)

// Parse the scheduled date/time
const scheduledDate = ref(post.scheduled_at ? parseISO(post.scheduled_at) : new Date())
const scheduledTime = ref(format(scheduledDate.value, 'HH:mm'))

// Date picker state using @internationalized/date
const calendarDate = ref(new CalendarDate(
  scheduledDate.value.getFullYear(),
  scheduledDate.value.getMonth() + 1,
  scheduledDate.value.getDate()
))

const isDraft = ref(post.status === 'draft')

// UI state
const isSubmitting = ref(false)
const mediaInput = ref('')
const showDatePicker = ref(false)

// Computed
const selectedAccountDetails = computed(() => {
  return accounts.value.filter((a) => selectedAccounts.value.includes(a.id))
})

const instagramSelected = computed(() => {
  return selectedAccountDetails.value.some((a) => a.platform === 'instagram')
})

const captionLength = computed(() => caption.value.length)
const captionWarning = computed(() => {
  if (instagramSelected.value && captionLength.value > 2200) {
    return 'Instagram captions max 2,200 characters'
  }
  return null
})

const canSubmit = computed(() => {
  return (
    caption.value.trim().length > 0 &&
    mediaUrls.value.length > 0 &&
    selectedAccounts.value.length > 0 &&
    !captionWarning.value
  )
})

const scheduledDateTime = computed(() => {
  const timeParts = (scheduledTime.value || '09:00').split(':').map(Number)
  const hours = timeParts[0] || 0
  const minutes = timeParts[1] || 0
  const date = new Date(calendarDate.value.year, calendarDate.value.month - 1, calendarDate.value.day)
  date.setHours(hours, minutes, 0, 0)
  return date
})

const postTypeOptions = [
  { value: 'image', label: 'Image', icon: 'i-lucide-image' },
  { value: 'video', label: 'Video', icon: 'i-lucide-video' },
  { value: 'carousel', label: 'Carousel', icon: 'i-lucide-images' },
  { value: 'reel', label: 'Reel', icon: 'i-lucide-clapperboard' },
  { value: 'story', label: 'Story', icon: 'i-lucide-clock' },
]

// Methods
function addMedia() {
  if (!mediaInput.value.trim()) return
  const url = mediaInput.value.trim()
  const isVideo = /\.(mp4|mov|webm|avi)$/i.test(url) || url.includes('video')
  mediaUrls.value.push(url)
  mediaTypes.value.push(isVideo ? 'video' : 'image')
  mediaInput.value = ''
}

function removeMedia(index: number) {
  mediaUrls.value.splice(index, 1)
  mediaTypes.value.splice(index, 1)
}

function toggleAccount(accountId: string) {
  const index = selectedAccounts.value.indexOf(accountId)
  if (index === -1) {
    selectedAccounts.value.push(accountId)
  } else {
    selectedAccounts.value.splice(index, 1)
  }
}

async function savePost() {
  if (!canSubmit.value) return

  isSubmitting.value = true

  try {
    const platforms: SocialPostTarget[] = selectedAccountDetails.value.map((account) => ({
      platform: account.platform,
      account_id: account.id,
      account_name: account.account_name,
    }))

    await $fetch(`/api/social/posts/${postId}`, {
      method: 'PATCH',
      body: {
        caption: caption.value,
        media_urls: mediaUrls.value,
        media_types: mediaTypes.value,
        platforms,
        post_type: postType.value,
        scheduled_at: scheduledDateTime.value.toISOString(),
        status: isDraft.value ? 'draft' : 'scheduled',
      },
    })

    toast.add({
      title: 'Post updated',
      description: isDraft.value
        ? 'Saved as draft'
        : `Rescheduled for ${format(scheduledDateTime.value, 'MMM d, h:mm a')}`,
      icon: 'i-lucide-check-circle',
      color: 'green',
    })

    await router.push('/social/calendar')
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to update post',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function deletePost() {
  if (!confirm('Are you sure you want to delete this post?')) return

  try {
    await $fetch(`/api/social/posts/${postId}`, { method: 'DELETE' })

    toast.add({
      title: 'Post deleted',
      icon: 'i-lucide-check-circle',
      color: 'green',
    })

    await router.push('/social/calendar')
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to delete post',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  }
}

const minDate = today(getLocalTimeZone())
</script>

<template>
  <div class="p-6 lg:p-8 max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <UButton to="/social/calendar" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Edit Post</h1>
          <p class="text-gray-500 dark:text-gray-400 mt-0.5">
            {{ post.status === 'draft' ? 'Draft' : 'Scheduled' }} •
            Created {{ format(parseISO(post.date_created), 'MMM d, yyyy') }}
          </p>
        </div>
      </div>
      <UButton variant="soft" color="red" icon="i-lucide-trash-2" @click="deletePost">
        Delete
      </UButton>
    </div>

    <div class="grid lg:grid-cols-5 gap-8">
      <!-- Main Form -->
      <div class="lg:col-span-3 space-y-6">
        <!-- Caption -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-gray-900 dark:text-white">Caption</h2>
              <span class="text-xs font-mono" :class="captionWarning ? 'text-red-500' : 'text-gray-400'">
                {{ captionLength }} / 2,200
              </span>
            </div>
          </template>

          <UTextarea v-model="caption" :rows="6" autoresize class="w-full" />
          <p v-if="captionWarning" class="text-sm text-red-500 mt-2">{{ captionWarning }}</p>
        </UCard>

        <!-- Media -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Media</h2>
          </template>

          <div v-if="mediaUrls.length > 0" class="grid grid-cols-3 gap-3 mb-4">
            <div
              v-for="(url, index) in mediaUrls"
              :key="index"
              class="relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group"
            >
              <img
                v-if="mediaTypes[index] === 'image'"
                :src="url"
                :alt="`Media ${index + 1}`"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-lucide-video" class="w-8 h-8 text-gray-400" />
              </div>
              <button
                @click="removeMedia(index)"
                class="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <UIcon name="i-lucide-x" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="flex gap-2">
            <UInput v-model="mediaInput" placeholder="Paste media URL..." class="flex-1" @keyup.enter="addMedia" />
            <UButton @click="addMedia" icon="i-lucide-plus" :disabled="!mediaInput.trim()">Add</UButton>
          </div>
        </UCard>

        <!-- Post Type -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Post Type</h2>
          </template>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="option in postTypeOptions"
              :key="option.value"
              :variant="postType === option.value ? 'solid' : 'soft'"
              :color="postType === option.value ? 'primary' : 'gray'"
              :icon="option.icon"
              size="sm"
              @click="postType = option.value as PostType"
            >
              {{ option.label }}
            </UButton>
          </div>
        </UCard>
      </div>

      <!-- Sidebar -->
      <div class="lg:col-span-2 space-y-6">
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

          <div class="space-y-2 max-h-[300px] overflow-y-auto">
            <label
              v-for="account in accounts"
              :key="account.id"
              class="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
              :class="selectedAccounts.includes(account.id) ? 'bg-primary/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
            >
              <UCheckbox :model-value="selectedAccounts.includes(account.id)" @update:model-value="toggleAccount(account.id)" />
              <UAvatar :src="account.profile_picture_url || undefined" :alt="account.account_name" size="xs" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ account.account_name }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <UIcon :name="account.platform === 'instagram' ? 'i-lucide-instagram' : 'i-lucide-music'" class="w-3 h-3" />
                  @{{ account.account_handle }}
                </p>
              </div>
            </label>
          </div>
        </UCard>

        <!-- Schedule with Date Picker -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-gray-900 dark:text-white">Schedule</h2>
          </template>

          <div class="space-y-4">
            <!-- Date Picker Trigger -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date</label>
              <UPopover>
                <UButton variant="outline" block class="justify-start">
                  <UIcon name="i-lucide-calendar" class="w-4 h-4 mr-2" />
                  {{ format(new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day), 'EEEE, MMMM d, yyyy') }}
                </UButton>

                <template #panel>
                  <div class="p-3">
                    <!-- Simple Calendar Grid -->
                    <div class="w-64">
                      <div class="flex items-center justify-between mb-3">
                        <UButton
                          variant="ghost"
                          icon="i-lucide-chevron-left"
                          size="xs"
                          @click="calendarDate = new CalendarDate(calendarDate.year, calendarDate.month - 1, 1)"
                        />
                        <span class="font-medium text-sm">
                          {{ format(new Date(calendarDate.year, calendarDate.month - 1, 1), 'MMMM yyyy') }}
                        </span>
                        <UButton
                          variant="ghost"
                          icon="i-lucide-chevron-right"
                          size="xs"
                          @click="calendarDate = new CalendarDate(calendarDate.year, calendarDate.month + 1, 1)"
                        />
                      </div>

                      <div class="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
                        <span v-for="d in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']" :key="d">{{ d }}</span>
                      </div>

                      <div class="grid grid-cols-7 gap-1">
                        <template v-for="i in 42" :key="i">
                          <button
                            v-if="getDayNumber(i)"
                            class="w-8 h-8 text-sm rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            :class="{
                              'bg-primary text-white hover:bg-primary/85': calendarDate.day === getDayNumber(i),
                              'text-gray-400': !isInCurrentMonth(i),
                            }"
                            @click="calendarDate = new CalendarDate(calendarDate.year, calendarDate.month, getDayNumber(i)!)"
                          >
                            {{ getDayNumber(i) }}
                          </button>
                          <span v-else class="w-8 h-8" />
                        </template>
                      </div>
                    </div>
                  </div>
                </template>
              </UPopover>
            </div>

            <!-- Time Picker -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Time</label>
              <UInput v-model="scheduledTime" type="time" />
            </div>

            <UCheckbox v-model="isDraft" label="Save as draft (pause scheduling)" />
          </div>
        </UCard>

        <!-- Submit -->
        <div class="space-y-3">
          <UButton
            @click="savePost"
            :loading="isSubmitting"
            :disabled="!canSubmit"
            block
            size="lg"
            icon="i-lucide-save"
          >
            Save Changes
          </UButton>

          <p v-if="!isDraft && canSubmit" class="text-xs text-center text-gray-500 dark:text-gray-400">
            Will be published {{ format(scheduledDateTime, 'MMM d, h:mm a') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// Helper functions for calendar (outside setup)
function getDayNumber(cellIndex: number): number | null {
  // This would need proper calculation based on month start day
  // Simplified version for demonstration
  return cellIndex <= 31 ? cellIndex : null
}

function isInCurrentMonth(cellIndex: number): boolean {
  return cellIndex <= 31
}
</script>
