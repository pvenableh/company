<script setup lang="ts">
/**
 * Social Media Module — Setup Instructions
 * /social/setup
 *
 * In-app guide for configuring the social media module.
 */

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})
useHead({ title: 'Social Setup | Earnest' })

const expandedSections = ref<Record<string, boolean>>({
  overview: true,
  directus: false,
  instagram: false,
  tiktok: false,
  env: false,
  troubleshooting: false,
})

const toggleSection = (key: string) => {
  expandedSections.value[key] = !expandedSections.value[key]
}

// Check current configuration status
const config = useRuntimeConfig()
const { data: accountsData } = await useFetch('/api/social/accounts')
const accounts = computed(() => accountsData.value?.data || [])

const checks = computed(() => [
  {
    label: 'Directus connection',
    status: !!config.public.directusUrl,
    detail: config.public.directusUrl || 'Not configured',
  },
  {
    label: 'Instagram accounts connected',
    status: accounts.value.some((a: any) => a.platform === 'instagram'),
    detail: `${accounts.value.filter((a: any) => a.platform === 'instagram').length} account(s)`,
  },
  {
    label: 'TikTok accounts connected',
    status: accounts.value.some((a: any) => a.platform === 'tiktok'),
    detail: `${accounts.value.filter((a: any) => a.platform === 'tiktok').length} account(s)`,
  },
])
</script>

<template>
  <div class="p-6 lg:p-8 max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-4 mb-8">
      <UButton to="/social/dashboard" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Social Media Setup</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-0.5">
          Configuration guide for Instagram &amp; TikTok integration
        </p>
      </div>
    </div>

    <!-- Status Checks -->
    <UCard class="mb-8">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-activity" class="w-5 h-5" />
          <h2 class="font-semibold text-gray-900 dark:text-white">Current Status</h2>
        </div>
      </template>
      <div class="space-y-3">
        <div v-for="check in checks" :key="check.label" class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="w-2.5 h-2.5 rounded-full"
              :class="check.status ? 'bg-emerald-500' : 'bg-amber-500'"
            />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ check.label }}</span>
          </div>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ check.detail }}</span>
        </div>
      </div>
      <template #footer>
        <div class="flex gap-3">
          <UButton to="/social/settings" size="sm" variant="soft">
            Manage Accounts
          </UButton>
          <UButton to="/social/dashboard" size="sm" variant="soft" color="gray">
            Go to Dashboard
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Setup Steps -->
    <div class="space-y-4">

      <!-- 1. Overview -->
      <UCard>
        <template #header>
          <button class="flex items-center justify-between w-full" @click="toggleSection('overview')">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400">1</div>
              <h2 class="font-semibold text-gray-900 dark:text-white">Overview</h2>
            </div>
            <UIcon
              :name="expandedSections.overview ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-5 h-5 text-gray-400"
            />
          </button>
        </template>
        <div v-if="expandedSections.overview" class="prose dark:prose-invert prose-sm max-w-none">
          <p>The Social Media module lets you manage Instagram and TikTok content from a single dashboard. Features include:</p>
          <ul>
            <li><strong>Multi-account management</strong> — Connect multiple Instagram Business and TikTok accounts</li>
            <li><strong>Post scheduling</strong> — Create, schedule, and publish posts across platforms</li>
            <li><strong>Content calendar</strong> — Visual monthly calendar of all scheduled content</li>
            <li><strong>Client management</strong> — Organize accounts by client/brand for agency workflows</li>
            <li><strong>Analytics</strong> — Track follower growth, engagement, and post performance</li>
          </ul>

          <h4>Pages</h4>
          <table>
            <thead>
              <tr><th>Page</th><th>Path</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td>Dashboard</td><td><code>/social/dashboard</code></td><td>Overview stats, upcoming posts, connected accounts</td></tr>
              <tr><td>Compose</td><td><code>/social/compose</code></td><td>Create and schedule new posts</td></tr>
              <tr><td>Calendar</td><td><code>/social/calendar</code></td><td>Monthly view of all scheduled content</td></tr>
              <tr><td>Analytics</td><td><code>/social/analytics</code></td><td>Metrics and performance data</td></tr>
              <tr><td>Clients</td><td><code>/social/clients</code></td><td>Manage agency clients and assign accounts</td></tr>
              <tr><td>Settings</td><td><code>/social/settings</code></td><td>Connect/disconnect social accounts</td></tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <!-- 2. Directus Collections -->
      <UCard>
        <template #header>
          <button class="flex items-center justify-between w-full" @click="toggleSection('directus')">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400">2</div>
              <h2 class="font-semibold text-gray-900 dark:text-white">Directus Collections Setup</h2>
            </div>
            <UIcon
              :name="expandedSections.directus ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-5 h-5 text-gray-400"
            />
          </button>
        </template>
        <div v-if="expandedSections.directus" class="prose dark:prose-invert prose-sm max-w-none">
          <p>The module requires 6 Directus collections. A setup script handles creation automatically.</p>

          <h4>Run the Setup Script</h4>
          <pre><code>pnpm tsx scripts/setup-social-collections.ts</code></pre>

          <p>The script requires these environment variables:</p>
          <ul>
            <li><code>DIRECTUS_URL</code> — Your Directus instance URL</li>
            <li><code>DIRECTUS_SERVER_TOKEN</code> — Admin static token with schema write permissions</li>
          </ul>

          <h4>Collections Created</h4>
          <table>
            <thead>
              <tr><th>Collection</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>social_clients</code></td><td>Agency client/brand management</td></tr>
              <tr><td><code>social_accounts</code></td><td>Connected Instagram &amp; TikTok accounts with encrypted tokens</td></tr>
              <tr><td><code>social_posts</code></td><td>Scheduled and published posts</td></tr>
              <tr><td><code>social_analytics_snapshots</code></td><td>Periodic metrics snapshots for trend analysis</td></tr>
              <tr><td><code>social_comments</code></td><td>Synced comments from platforms</td></tr>
              <tr><td><code>social_activity_log</code></td><td>Audit trail for all social actions</td></tr>
            </tbody>
          </table>

          <p>After running, regenerate TypeScript types:</p>
          <pre><code>pnpm generate:types</code></pre>
        </div>
      </UCard>

      <!-- 3. Instagram Setup -->
      <UCard>
        <template #header>
          <button class="flex items-center justify-between w-full" @click="toggleSection('instagram')">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center text-sm font-bold text-white">3</div>
              <h2 class="font-semibold text-gray-900 dark:text-white">Instagram Configuration</h2>
            </div>
            <UIcon
              :name="expandedSections.instagram ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-5 h-5 text-gray-400"
            />
          </button>
        </template>
        <div v-if="expandedSections.instagram" class="prose dark:prose-invert prose-sm max-w-none">
          <p>Instagram integration uses the <strong>Facebook Login for Business</strong> flow to access Instagram Business accounts via the Graph API.</p>

          <h4>Prerequisites</h4>
          <ul>
            <li>A <strong>Facebook Developer</strong> account</li>
            <li>An <strong>Instagram Business</strong> or <strong>Creator</strong> account (not a personal account)</li>
            <li>The Instagram account must be linked to a <strong>Facebook Page</strong></li>
          </ul>

          <h4>Step 1: Create a Facebook App</h4>
          <ol>
            <li>Go to <strong>developers.facebook.com</strong> and create a new app</li>
            <li>Select app type: <strong>Business</strong></li>
            <li>Add the <strong>Instagram Graph API</strong> product</li>
            <li>Add <strong>Facebook Login for Business</strong> product</li>
          </ol>

          <h4>Step 2: Configure OAuth Settings</h4>
          <ol>
            <li>In Facebook Login settings, add your redirect URI:
              <pre><code>https://your-domain.com/api/social/oauth/instagram/callback</code></pre>
            </li>
            <li>Required permissions/scopes:
              <ul>
                <li><code>instagram_basic</code></li>
                <li><code>instagram_content_publish</code></li>
                <li><code>instagram_manage_comments</code></li>
                <li><code>instagram_manage_insights</code></li>
                <li><code>pages_show_list</code></li>
                <li><code>pages_read_engagement</code></li>
              </ul>
            </li>
          </ol>

          <h4>Step 3: Environment Variables</h4>
          <pre><code>INSTAGRAM_APP_ID=your_facebook_app_id
INSTAGRAM_APP_SECRET=your_facebook_app_secret
INSTAGRAM_REDIRECT_URI=https://your-domain.com/api/social/oauth/instagram/callback</code></pre>

          <h4>Step 4: Connect Account</h4>
          <p>Once configured, go to <strong>Social Settings</strong> and click <strong>Connect</strong> under the Instagram section. You'll be redirected to Facebook to authorize the app.</p>

          <div class="not-prose">
            <UAlert
              color="blue"
              variant="subtle"
              icon="i-lucide-info"
              title="Token Expiration"
              description="Instagram uses long-lived tokens (60 days). The system auto-refreshes tokens before expiry. Check the Settings page for token status."
              class="mt-4"
            />
          </div>
        </div>
      </UCard>

      <!-- 4. TikTok Setup -->
      <UCard>
        <template #header>
          <button class="flex items-center justify-between w-full" @click="toggleSection('tiktok')">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-full bg-black flex items-center justify-center text-sm font-bold text-white">4</div>
              <h2 class="font-semibold text-gray-900 dark:text-white">TikTok Configuration</h2>
            </div>
            <UIcon
              :name="expandedSections.tiktok ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-5 h-5 text-gray-400"
            />
          </button>
        </template>
        <div v-if="expandedSections.tiktok" class="prose dark:prose-invert prose-sm max-w-none">
          <p>TikTok integration uses the <strong>TikTok Login Kit</strong> and <strong>Content Posting API</strong>.</p>

          <h4>Prerequisites</h4>
          <ul>
            <li>A <strong>TikTok Developer</strong> account</li>
            <li>A TikTok account to connect</li>
          </ul>

          <h4>Step 1: Create a TikTok App</h4>
          <ol>
            <li>Go to <strong>developers.tiktok.com</strong> and create a new app</li>
            <li>Add products: <strong>Login Kit</strong> and <strong>Content Posting API</strong></li>
            <li>For Content Posting API, select the scopes:
              <ul>
                <li><code>user.info.basic</code></li>
                <li><code>video.upload</code></li>
                <li><code>video.publish</code></li>
                <li><code>video.list</code></li>
              </ul>
            </li>
          </ol>

          <h4>Step 2: Configure Redirect URI</h4>
          <p>In your TikTok app settings, add the redirect URI:</p>
          <pre><code>https://your-domain.com/api/social/oauth/tiktok/callback</code></pre>

          <h4>Step 3: Environment Variables</h4>
          <pre><code>TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
TIKTOK_REDIRECT_URI=https://your-domain.com/api/social/oauth/tiktok/callback</code></pre>

          <h4>Step 4: Connect Account</h4>
          <p>Go to <strong>Social Settings</strong> and click <strong>Connect</strong> under the TikTok section.</p>

          <div class="not-prose">
            <UAlert
              color="amber"
              variant="subtle"
              icon="i-lucide-alert-triangle"
              title="Direct Post vs Inbox Draft"
              description="By default, TikTok posts are sent as inbox drafts. Direct posting (public visibility) requires TikTok audit approval of your app. This is a TikTok platform requirement."
              class="mt-4"
            />
          </div>

          <div class="not-prose mt-3">
            <UAlert
              color="blue"
              variant="subtle"
              icon="i-lucide-info"
              title="Token Lifecycle"
              description="TikTok access tokens expire after 24 hours but are automatically refreshed using the refresh token (valid 365 days)."
            />
          </div>
        </div>
      </UCard>

      <!-- 5. Environment Variables -->
      <UCard>
        <template #header>
          <button class="flex items-center justify-between w-full" @click="toggleSection('env')">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400">5</div>
              <h2 class="font-semibold text-gray-900 dark:text-white">All Environment Variables</h2>
            </div>
            <UIcon
              :name="expandedSections.env ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-5 h-5 text-gray-400"
            />
          </button>
        </template>
        <div v-if="expandedSections.env" class="prose dark:prose-invert prose-sm max-w-none">
          <p>Add these to your <code>.env</code> file:</p>

          <table>
            <thead>
              <tr><th>Variable</th><th>Required</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr><td><code>INSTAGRAM_APP_ID</code></td><td>For Instagram</td><td>Facebook App ID</td></tr>
              <tr><td><code>INSTAGRAM_APP_SECRET</code></td><td>For Instagram</td><td>Facebook App Secret</td></tr>
              <tr><td><code>INSTAGRAM_REDIRECT_URI</code></td><td>For Instagram</td><td>OAuth callback URL</td></tr>
              <tr><td><code>TIKTOK_CLIENT_KEY</code></td><td>For TikTok</td><td>TikTok App Client Key</td></tr>
              <tr><td><code>TIKTOK_CLIENT_SECRET</code></td><td>For TikTok</td><td>TikTok App Client Secret</td></tr>
              <tr><td><code>TIKTOK_REDIRECT_URI</code></td><td>For TikTok</td><td>OAuth callback URL</td></tr>
              <tr><td><code>SOCIAL_ENCRYPTION_KEY</code></td><td>Yes</td><td>AES-256 key for token encryption (min 32 chars). Generate with <code>openssl rand -base64 32</code></td></tr>
              <tr><td><code>DIRECTUS_URL</code></td><td>Yes</td><td>Directus instance URL</td></tr>
              <tr><td><code>DIRECTUS_SERVER_TOKEN</code></td><td>Yes</td><td>Directus admin token</td></tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <!-- 6. Troubleshooting -->
      <UCard>
        <template #header>
          <button class="flex items-center justify-between w-full" @click="toggleSection('troubleshooting')">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-sm font-bold text-red-600 dark:text-red-400">?</div>
              <h2 class="font-semibold text-gray-900 dark:text-white">Troubleshooting</h2>
            </div>
            <UIcon
              :name="expandedSections.troubleshooting ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-5 h-5 text-gray-400"
            />
          </button>
        </template>
        <div v-if="expandedSections.troubleshooting" class="prose dark:prose-invert prose-sm max-w-none">

          <h4>"No accounts connected" on Dashboard</h4>
          <ul>
            <li>Go to <strong>/social/settings</strong> and click <strong>Connect</strong></li>
            <li>Make sure your <code>INSTAGRAM_*</code> or <code>TIKTOK_*</code> environment variables are set</li>
            <li>Verify the redirect URI in your platform app settings matches your <code>.env</code></li>
          </ul>

          <h4>OAuth redirect fails or returns error</h4>
          <ul>
            <li>Check that the redirect URI matches exactly (including <code>https</code> vs <code>http</code>)</li>
            <li>For Instagram: Ensure your Facebook App has "Facebook Login for Business" product enabled</li>
            <li>For TikTok: Ensure "Login Kit" and "Content Posting API" are added to your app</li>
            <li>Check server logs for detailed error messages</li>
          </ul>

          <h4>Instagram: "Token expired" status</h4>
          <ul>
            <li>Instagram long-lived tokens last 60 days</li>
            <li>Click <strong>Reconnect</strong> in settings to get a fresh token</li>
            <li>The system auto-refreshes tokens when possible</li>
          </ul>

          <h4>TikTok: Posts go to "inbox" instead of publishing directly</h4>
          <ul>
            <li>This is expected behavior without TikTok audit approval</li>
            <li>Submit your TikTok app for audit to enable direct posting</li>
            <li>Until approved, users must manually publish from their TikTok inbox</li>
          </ul>

          <h4>Directus collections not found</h4>
          <ul>
            <li>Run the setup script: <code>pnpm tsx scripts/setup-social-collections.ts</code></li>
            <li>Ensure <code>DIRECTUS_SERVER_TOKEN</code> has schema write permissions</li>
            <li>Regenerate types after setup: <code>pnpm generate:types</code></li>
          </ul>

          <h4>Encryption errors</h4>
          <ul>
            <li>Make sure <code>SOCIAL_ENCRYPTION_KEY</code> is set and at least 32 characters</li>
            <li>Changing the encryption key will invalidate all stored tokens — users will need to reconnect</li>
          </ul>
        </div>
      </UCard>
    </div>
  </div>
</template>
