<script setup lang="ts">
/**
 * Social Media Settings — Account Management
 * /social/settings
 */

import { differenceInDays } from 'date-fns'
import type { SocialAccountPublic, SocialPlatform } from '~~/shared/social'

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})
useHead({ title: 'Social Settings | Earnest' })

const route = useRoute()
const toast = useToast()

// Platform display config
const platformConfig: Record<SocialPlatform, {
  label: string
  icon: string
  bgClass: string
  connectLabel: string
  footerNote?: string
}> = {
  instagram: {
    label: 'Instagram',
    icon: 'i-lucide-instagram',
    bgClass: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500',
    connectLabel: 'Connect Instagram Business Account',
  },
  tiktok: {
    label: 'TikTok',
    icon: 'i-lucide-music',
    bgClass: 'bg-black',
    connectLabel: 'Connect TikTok Account',
    footerNote: 'TikTok posts are sent to your inbox as drafts. Direct posting requires TikTok audit approval.',
  },
  linkedin: {
    label: 'LinkedIn',
    icon: 'i-lucide-linkedin',
    bgClass: 'bg-[#0A66C2]',
    connectLabel: 'Connect LinkedIn Account',
    footerNote: 'Connects your personal profile and any Company Pages you manage.',
  },
  facebook: {
    label: 'Facebook',
    icon: 'i-lucide-facebook',
    bgClass: 'bg-[#1877F2]',
    connectLabel: 'Connect Facebook Page',
    footerNote: 'Only Facebook Pages you manage can be connected. Personal profiles are not supported.',
  },
  threads: {
    label: 'Threads',
    icon: 'i-lucide-at-sign',
    bgClass: 'bg-black',
    connectLabel: 'Connect Threads Account',
  },
}

const platformOrder: SocialPlatform[] = ['instagram', 'tiktok', 'linkedin', 'facebook', 'threads']

// Handle OAuth callback messages
onMounted(() => {
  const { success, error, count, message } = route.query

  if (success) {
    const platform = success as string
    const config = platformConfig[platform as SocialPlatform]
    const label = config?.label || platform

    toast.add({
      title: 'Account connected',
      description: count
        ? `Successfully connected ${count} ${label} account(s)`
        : `Successfully connected ${label} account`,
      icon: 'i-lucide-check-circle',
      color: 'green',
    })
  }

  if (error) {
    toast.add({
      title: 'Connection failed',
      description: message ? decodeURIComponent(message as string) : `Failed to connect ${error}`,
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  }
})

// Fetch accounts (lazy to avoid blocking page render on Directus errors)
const { data: accountsData, refresh: refreshAccounts } = useLazyFetch('/api/social/accounts')
const accounts = computed(() => (accountsData.value?.data || []) as SocialAccountPublic[])

function accountsForPlatform(platform: SocialPlatform) {
  return accounts.value.filter((a) => a.platform === platform)
}

// UI state
const isDeleting = ref<string | null>(null)
const showDeleteModal = ref(false)
const accountToDelete = ref<SocialAccountPublic | null>(null)

function getTokenStatus(account: SocialAccountPublic) {
  const expiresAt = new Date(account.token_expires_at)
  const daysUntilExpiry = differenceInDays(expiresAt, new Date())

  if (account.status === 'expired' || daysUntilExpiry < 0) {
    return { label: 'Expired', color: 'red' as const }
  }
  if (account.status === 'revoked') {
    return { label: 'Revoked', color: 'red' as const }
  }
  if (daysUntilExpiry < 7) {
    return { label: `Expires in ${daysUntilExpiry}d`, color: 'amber' as const }
  }
  return { label: 'Active', color: 'emerald' as const }
}

function confirmDelete(account: SocialAccountPublic) {
  accountToDelete.value = account
  showDeleteModal.value = true
}

async function disconnectAccount() {
  if (!accountToDelete.value) return

  isDeleting.value = accountToDelete.value.id

  try {
    await $fetch(`/api/social/accounts/${accountToDelete.value.id}`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'Account disconnected',
      description: `${accountToDelete.value.account_name} has been removed`,
      icon: 'i-lucide-check-circle',
      color: 'green',
    })

    await refreshAccounts()
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to disconnect account',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  } finally {
    isDeleting.value = null
    showDeleteModal.value = false
    accountToDelete.value = null
  }
}
</script>

<template>
  <div class="p-6 lg:p-8 max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-4 mb-8">
      <UButton to="/social/dashboard" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Social Settings</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-0.5">Manage your connected accounts</p>
      </div>
    </div>

    <div class="space-y-8">
      <!-- Platform Sections -->
      <UCard v-for="platform in platformOrder" :key="platform">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg" :class="platformConfig[platform].bgClass">
                <UIcon :name="platformConfig[platform].icon" class="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 class="font-semibold text-gray-900 dark:text-white">{{ platformConfig[platform].label }}</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ accountsForPlatform(platform).length }} account{{ accountsForPlatform(platform).length !== 1 ? 's' : '' }} connected
                </p>
              </div>
            </div>
            <UButton :to="`/api/social/accounts/connect/${platform}`" external icon="i-lucide-plus" size="sm">
              Connect
            </UButton>
          </div>
        </template>

        <div v-if="accountsForPlatform(platform).length === 0" class="text-center py-8">
          <UIcon :name="platformConfig[platform].icon" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p class="text-gray-500 dark:text-gray-400 mb-4">No {{ platformConfig[platform].label }} accounts connected</p>
          <UButton :to="`/api/social/accounts/connect/${platform}`" external variant="soft">
            {{ platformConfig[platform].connectLabel }}
          </UButton>
        </div>

        <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="account in accountsForPlatform(platform)" :key="account.id" class="flex items-center gap-4 py-4">
            <UAvatar :src="account.profile_picture_url || undefined" :alt="account.account_name" size="lg" />
            <div class="flex-1 min-w-0">
              <p class="font-medium text-gray-900 dark:text-white">{{ account.account_name }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">@{{ account.account_handle }}</p>
            </div>
            <UBadge :color="getTokenStatus(account).color" variant="subtle" size="sm">
              {{ getTokenStatus(account).label }}
            </UBadge>
            <UDropdown
              :items="[
                [{ label: 'Reconnect', icon: 'i-lucide-refresh-cw', to: `/api/social/accounts/connect/${platform}`, external: true }],
                [{ label: 'Disconnect', icon: 'i-lucide-trash-2', click: () => confirmDelete(account) }],
              ]"
            >
              <UButton variant="ghost" icon="i-lucide-more-vertical" size="sm" />
            </UDropdown>
          </div>
        </div>

        <template v-if="platformConfig[platform].footerNote" #footer>
          <div class="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
            <UIcon name="i-lucide-info" class="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{{ platformConfig[platform].footerNote }}</p>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Delete Confirmation Modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 class="font-semibold text-gray-900 dark:text-white">Disconnect Account</h3>
          </div>
        </template>

        <p class="text-gray-600 dark:text-gray-300">
          Are you sure you want to disconnect <strong>{{ accountToDelete?.account_name }}</strong>?
          You'll need to reconnect to post to this account again.
        </p>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton variant="ghost" @click="showDeleteModal = false">Cancel</UButton>
            <UButton color="red" :loading="isDeleting === accountToDelete?.id" @click="disconnectAccount">
              Disconnect
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
