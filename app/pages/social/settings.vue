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

// ── Setup guide (per-platform OAuth + env reference, surfaced at bottom of page) ──
type SetupGuide = {
  envVars: { name: string; required: boolean; note?: string }[]
  scopes: string[]
  redirectPath: string
  consoleUrl: string
  consoleLabel: string
  notes?: string[]
}

const setupGuides: Record<SocialPlatform, SetupGuide> = {
  instagram: {
    envVars: [
      { name: 'INSTAGRAM_APP_ID', required: true, note: 'Meta app ID (shared across IG/FB/Threads)' },
      { name: 'INSTAGRAM_APP_SECRET', required: true, note: 'Meta app secret (shared across IG/FB/Threads)' },
      { name: 'INSTAGRAM_REDIRECT_URI', required: true },
    ],
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
    ],
    redirectPath: '/api/social/oauth/instagram/callback',
    consoleUrl: 'https://developers.facebook.com/apps/',
    consoleLabel: 'Meta for Developers',
    notes: [
      'Requires an Instagram Business or Creator account linked to a Facebook Page.',
      'Long-lived tokens last 60 days; the system auto-refreshes before expiry.',
    ],
  },
  tiktok: {
    envVars: [
      { name: 'TIKTOK_CLIENT_KEY', required: true },
      { name: 'TIKTOK_CLIENT_SECRET', required: true },
      { name: 'TIKTOK_REDIRECT_URI', required: true },
    ],
    scopes: ['user.info.basic', 'video.upload', 'video.publish', 'video.list'],
    redirectPath: '/api/social/oauth/tiktok/callback',
    consoleUrl: 'https://developers.tiktok.com/',
    consoleLabel: 'TikTok for Developers',
    notes: [
      'Posts go to inbox as drafts by default. Direct posting requires TikTok audit approval.',
      'Access tokens expire after 24h; refresh tokens last 365 days and refresh automatically.',
    ],
  },
  linkedin: {
    envVars: [
      { name: 'LINKEDIN_CLIENT_ID', required: true },
      { name: 'LINKEDIN_CLIENT_SECRET', required: true },
      { name: 'LINKEDIN_REDIRECT_URI', required: true },
    ],
    scopes: [
      'openid',
      'profile',
      'w_member_social',
      'r_organization_social',
      'w_organization_social',
      'rw_organization_admin',
    ],
    redirectPath: '/api/social/oauth/linkedin/callback',
    consoleUrl: 'https://www.linkedin.com/developers/apps',
    consoleLabel: 'LinkedIn Developer Portal',
    notes: [
      'Community Management API is invite-only and must be the only product on the app — recommend Marketing Developer Platform instead.',
      'For personal-only posting until org-page approval, trim scopes to: openid, profile, w_member_social.',
    ],
  },
  facebook: {
    envVars: [
      { name: 'FACEBOOK_APP_ID', required: false, note: 'Falls back to INSTAGRAM_APP_ID (same Meta app)' },
      { name: 'FACEBOOK_APP_SECRET', required: false, note: 'Falls back to INSTAGRAM_APP_SECRET' },
      { name: 'FACEBOOK_REDIRECT_URI', required: true },
    ],
    scopes: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_engagement',
      'pages_read_user_content',
      'read_insights',
    ],
    redirectPath: '/api/social/oauth/facebook/callback',
    consoleUrl: 'https://developers.facebook.com/apps/',
    consoleLabel: 'Meta for Developers',
    notes: [
      'Only Facebook Pages you manage can be connected — personal profiles are not supported.',
    ],
  },
  threads: {
    envVars: [
      { name: 'THREADS_APP_ID', required: false, note: 'Falls back to INSTAGRAM_APP_ID' },
      { name: 'THREADS_APP_SECRET', required: false, note: 'Falls back to INSTAGRAM_APP_SECRET' },
      { name: 'THREADS_REDIRECT_URI', required: true },
    ],
    scopes: [
      'threads_basic',
      'threads_content_publish',
      'threads_manage_insights',
      'threads_manage_replies',
    ],
    redirectPath: '/api/social/oauth/threads/callback',
    consoleUrl: 'https://developers.facebook.com/apps/',
    consoleLabel: 'Meta for Developers',
  },
}

const siteOrigin = useRuntimeConfig().public.siteUrl as string

function fullRedirectUri(platform: SocialPlatform): string {
  return `${siteOrigin}${setupGuides[platform].redirectPath}`
}

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
  <LayoutPageContainer>
    <!-- Header -->
    <div class="flex items-center gap-4 mb-8">
      <UButton to="/social" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
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

    <!-- Setup Guide (env vars / OAuth scopes / redirect URI per platform) -->
    <section id="setup-guide" class="mt-12 scroll-mt-24">
      <div class="flex items-center gap-2 mb-4">
        <UIcon name="i-lucide-book-open" class="w-5 h-5 text-muted-foreground" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Setup Guide</h2>
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Configure these env vars and OAuth settings on each platform's developer console before connecting an account.
      </p>

      <div class="space-y-3">
        <details
          v-for="platform in platformOrder"
          :key="platform"
          class="group rounded-xl border border-border/60 bg-background"
        >
          <summary
            class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none select-none hover:bg-muted/30 rounded-xl"
          >
            <div class="flex items-center gap-3">
              <div class="p-1.5 rounded-md" :class="platformConfig[platform].bgClass">
                <UIcon :name="platformConfig[platform].icon" class="w-4 h-4 text-white" />
              </div>
              <span class="font-medium text-gray-900 dark:text-white">
                {{ platformConfig[platform].label }} setup
              </span>
            </div>
            <UIcon
              name="i-lucide-chevron-down"
              class="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>

          <div class="px-4 pb-4 pt-2 border-t border-border/40 space-y-4 text-sm">
            <!-- Developer console -->
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Developer console</p>
              <a
                :href="setupGuides[platform].consoleUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                {{ setupGuides[platform].consoleLabel }}
                <UIcon name="i-lucide-external-link" class="w-3 h-3" />
              </a>
            </div>

            <!-- Redirect URI -->
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Redirect URI (allowlist this exactly)</p>
              <code class="block px-3 py-2 bg-muted/40 rounded-md text-[12px] break-all">{{ fullRedirectUri(platform) }}</code>
            </div>

            <!-- OAuth scopes -->
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">OAuth scopes requested</p>
              <div class="flex flex-wrap gap-1.5">
                <code
                  v-for="scope in setupGuides[platform].scopes"
                  :key="scope"
                  class="px-2 py-0.5 bg-muted/40 rounded text-[11px]"
                >{{ scope }}</code>
              </div>
            </div>

            <!-- Env vars -->
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Environment variables</p>
              <ul class="space-y-1">
                <li
                  v-for="env in setupGuides[platform].envVars"
                  :key="env.name"
                  class="flex flex-wrap items-baseline gap-2"
                >
                  <code class="text-[12px]">{{ env.name }}</code>
                  <span
                    class="text-[10px] uppercase tracking-wider"
                    :class="env.required ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'"
                  >{{ env.required ? 'required' : 'optional' }}</span>
                  <span v-if="env.note" class="text-[12px] text-muted-foreground">— {{ env.note }}</span>
                </li>
              </ul>
            </div>

            <!-- Notes -->
            <div v-if="setupGuides[platform].notes?.length">
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Notes</p>
              <ul class="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
                <li v-for="(note, i) in setupGuides[platform].notes" :key="i">{{ note }}</li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      <div class="mt-4 text-xs text-muted-foreground">
        <p>
          Also required globally:
          <code>SOCIAL_ENCRYPTION_KEY</code> (AES-256, min 32 chars; rotating invalidates all stored tokens),
          <code>DIRECTUS_URL</code>, and <code>DIRECTUS_SERVER_TOKEN</code>.
        </p>
      </div>
    </section>

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
  </LayoutPageContainer>
</template>
