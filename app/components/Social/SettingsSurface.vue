<script setup lang="ts">
/**
 * SocialSettingsSurface — body of the legacy /social/settings page,
 * extracted for the Accounts floor's `view=settings` sub-view.
 *
 * Per-platform OAuth connect cards + per-account row controls
 * (re-assign owner, fetch history, disconnect). Includes the setup
 * guide section and the backfill + disconnect modals.
 */
import { differenceInDays } from 'date-fns';
import { Button } from '~/components/ui/button';
import type { SocialAccountPublic, SocialPlatform } from '~~/shared/social';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { isOrgAdminOrAbove } = useOrgRole();
const { clientList: clients } = useClients();

type PlatformKey = SocialPlatform | 'linkedin-org';

const platformConfig: Record<PlatformKey, {
  label: string;
  icon: string;
  connectLabel: string;
  connectPath: string;
  footerNote?: string;
}> = {
  instagram: {
    label: 'Instagram',
    icon: 'logos:instagram-icon',
    connectLabel: 'Connect Instagram Business Account',
    connectPath: '/api/social/accounts/connect/instagram',
  },
  tiktok: {
    label: 'TikTok',
    icon: 'logos:tiktok-icon',
    connectLabel: 'Connect TikTok Account',
    connectPath: '/api/social/accounts/connect/tiktok',
    footerNote: 'TikTok posts are sent to your inbox as drafts. Direct posting requires TikTok audit approval.',
  },
  linkedin: {
    label: 'LinkedIn (Personal)',
    icon: 'logos:linkedin-icon',
    connectLabel: 'Connect Personal LinkedIn',
    connectPath: '/api/social/accounts/connect/linkedin',
    footerNote: 'Posts to your personal LinkedIn profile. Use the Company Pages card below to post to a LinkedIn Page.',
  },
  'linkedin-org': {
    label: 'LinkedIn (Company Pages)',
    icon: 'logos:linkedin-icon',
    connectLabel: 'Connect LinkedIn Company Pages',
    connectPath: '/api/social/accounts/connect/linkedin-org',
    footerNote: 'Requires LinkedIn Community Management API approval (separate app). Connects all Company Pages you administer.',
  },
  facebook: {
    label: 'Facebook',
    icon: 'logos:facebook',
    connectLabel: 'Connect Facebook Page',
    connectPath: '/api/social/accounts/connect/facebook',
    footerNote: 'Only Facebook Pages you manage can be connected. Personal profiles are not supported.',
  },
  threads: {
    label: 'Threads',
    icon: 'logos:threads-icon',
    connectLabel: 'Connect Threads Account',
    connectPath: '/api/social/accounts/connect/threads',
  },
};

const platformOrder: PlatformKey[] = ['instagram', 'tiktok', 'linkedin', 'linkedin-org', 'facebook', 'threads'];

type SetupGuide = {
  envVars: { name: string; required: boolean; note?: string }[];
  scopes: string[];
  redirectPath: string;
  consoleUrl: string;
  consoleLabel: string;
  notes?: string[];
};

const setupGuides: Record<PlatformKey, SetupGuide> = {
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
    scopes: ['openid', 'profile', 'w_member_social'],
    redirectPath: '/api/social/oauth/linkedin/callback',
    consoleUrl: 'https://www.linkedin.com/developers/apps',
    consoleLabel: 'LinkedIn Developer Portal',
    notes: [
      'Add the products "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" to this app.',
      'For Company-Page posting, set up a SECOND app and configure the LINKEDIN_ORG_* env vars (see LinkedIn Company Pages setup below).',
    ],
  },
  'linkedin-org': {
    envVars: [
      { name: 'LINKEDIN_ORG_CLIENT_ID', required: true },
      { name: 'LINKEDIN_ORG_CLIENT_SECRET', required: true },
      { name: 'LINKEDIN_ORG_REDIRECT_URI', required: true },
    ],
    scopes: ['r_organization_social', 'w_organization_social', 'rw_organization_admin'],
    redirectPath: '/api/social/oauth/linkedin-org/callback',
    consoleUrl: 'https://www.linkedin.com/developers/apps',
    consoleLabel: 'LinkedIn Developer Portal',
    notes: [
      'Use a SECOND LinkedIn app — Community Management API legal rules require it to be the only product on its app.',
      'Submit a Community Management API access request with privacy policy + terms of service URLs and a clear use-case write-up.',
      'Approval can take weeks and is frequently denied; this card stays empty until LinkedIn approves.',
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
    notes: ['Only Facebook Pages you manage can be connected — personal profiles are not supported.'],
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
};

const siteOrigin = useRuntimeConfig().public.siteUrl as string;
function fullRedirectUri(platform: PlatformKey): string {
  return `${siteOrigin}${setupGuides[platform].redirectPath}`;
}

onMounted(() => {
  const { success, error, count, message } = route.query;
  if (success) {
    const platform = success as string;
    const config = platformConfig[platform as SocialPlatform];
    const label = config?.label || platform;
    toast.add({
      title: 'Account connected',
      description: count
        ? `Successfully connected ${count} ${label} account(s)`
        : `Successfully connected ${label} account`,
      icon: 'i-lucide-check-circle',
      color: 'green',
    });
  }
  if (error) {
    toast.add({
      title: 'Connection failed',
      description: message ? decodeURIComponent(message as string) : `Failed to connect ${error}`,
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  }
});

const { data: accountsData, refresh: refreshAccounts } = useLazyFetch('/api/social/accounts');
const accounts = computed(() => (accountsData.value?.data || []) as SocialAccountPublic[]);

function accountsForPlatform(platform: PlatformKey) {
  if (platform === 'linkedin') {
    return accounts.value.filter(
      (a) => a.platform === 'linkedin' && (a.metadata as any)?.type !== 'organization',
    );
  }
  if (platform === 'linkedin-org') {
    return accounts.value.filter(
      (a) => a.platform === 'linkedin' && (a.metadata as any)?.type === 'organization',
    );
  }
  return accounts.value.filter((a) => a.platform === platform);
}

const isDeleting = ref<string | null>(null);
const showDeleteModal = ref(false);
const accountToDelete = ref<SocialAccountPublic | null>(null);

const isBackfilling = ref<string | null>(null);
const showBackfillModal = ref(false);
const accountToBackfill = ref<SocialAccountPublic | null>(null);
const backfillDays = ref(28);

const BACKFILL_SUPPORTED_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram'];
function supportsBackfill(account: SocialAccountPublic): boolean {
  return BACKFILL_SUPPORTED_PLATFORMS.includes(account.platform);
}

function openBackfillModal(account: SocialAccountPublic) {
  accountToBackfill.value = account;
  backfillDays.value = 28;
  showBackfillModal.value = true;
}

async function runBackfill() {
  if (!accountToBackfill.value) return;
  const accountId = accountToBackfill.value.id;
  const accountName = accountToBackfill.value.account_name;
  isBackfilling.value = accountId;
  showBackfillModal.value = false;

  try {
    const res = (await $fetch(`/api/social/accounts/${accountId}/backfill`, {
      method: 'POST',
      body: { days: backfillDays.value },
    })) as any;

    const lines = [
      `${res.days_processed} day(s) added`,
      res.days_skipped > 0 ? `${res.days_skipped} skipped` : null,
      res.posts_processed > 0 ? `${res.posts_processed} post(s) added` : null,
      res.days_failed > 0 || res.posts_failed > 0
        ? `${res.days_failed + res.posts_failed} failed (see server logs)`
        : null,
    ].filter(Boolean);

    toast.add({
      title: `Backfill complete — ${accountName}`,
      description: lines.join(' · ') + (res.note ? ` ${res.note}` : ''),
      icon: 'i-lucide-check-circle',
      color: 'green',
    });
  } catch (error: any) {
    toast.add({
      title: 'Backfill failed',
      description: error.data?.message || error.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    isBackfilling.value = null;
    accountToBackfill.value = null;
  }
}

function getTokenStatus(account: SocialAccountPublic) {
  const expiresAt = new Date(account.token_expires_at);
  const daysUntilExpiry = differenceInDays(expiresAt, new Date());

  if (account.status === 'expired' || daysUntilExpiry < 0) {
    return { label: 'Expired', color: 'red' as const };
  }
  if (account.status === 'revoked') {
    return { label: 'Revoked', color: 'red' as const };
  }
  if (daysUntilExpiry < 7) {
    return { label: `Expires in ${daysUntilExpiry}d`, color: 'amber' as const };
  }
  return { label: 'Active', color: 'emerald' as const };
}

function confirmDelete(account: SocialAccountPublic) {
  accountToDelete.value = account;
  showDeleteModal.value = true;
}

async function disconnectAccount() {
  if (!accountToDelete.value) return;
  isDeleting.value = accountToDelete.value.id;
  try {
    await $fetch(`/api/social/accounts/${accountToDelete.value.id}`, { method: 'DELETE' });
    toast.add({
      title: 'Account disconnected',
      description: `${accountToDelete.value.account_name} has been removed`,
      icon: 'i-lucide-check-circle',
      color: 'green',
    });
    await refreshAccounts();
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to disconnect account',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    isDeleting.value = null;
    showDeleteModal.value = false;
    accountToDelete.value = null;
  }
}

async function reassignAccountClient(account: SocialAccountPublic, newClient: string | null) {
  try {
    await $fetch(`/api/social/accounts/${account.id}`, {
      method: 'PATCH',
      body: { client: newClient },
    });
    await refreshAccounts();
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to update account owner',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3 gap-2">
      <p class="text-xs text-muted-foreground">Manage your connected accounts</p>
      <Button
        v-if="isOrgAdminOrAbove"
        variant="ghost"
        size="sm"
        @click="router.push('/social/diagnostics')"
      >
        <Icon name="lucide:stethoscope" class="w-4 h-4 mr-1" />
        Diagnostics
      </Button>
    </div>

    <div class="space-y-8">
      <UCard v-for="platform in platformOrder" :key="platform">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <UIcon :name="platformConfig[platform].icon" class="w-9 h-9 shrink-0" />
              <div>
                <h2 class="font-semibold text-gray-900 dark:text-white">{{ platformConfig[platform].label }}</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ accountsForPlatform(platform).length }} account{{ accountsForPlatform(platform).length !== 1 ? 's' : '' }} connected
                </p>
              </div>
            </div>
            <UButton :to="platformConfig[platform].connectPath" external icon="i-lucide-plus" size="sm">
              Connect
            </UButton>
          </div>
        </template>

        <div v-if="accountsForPlatform(platform).length === 0" class="text-center py-8">
          <UIcon :name="platformConfig[platform].icon" class="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p class="text-gray-500 dark:text-gray-400 mb-4">No {{ platformConfig[platform].label }} accounts connected</p>
          <UButton :to="platformConfig[platform].connectPath" external variant="soft">
            {{ platformConfig[platform].connectLabel }}
          </UButton>
        </div>

        <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="account in accountsForPlatform(platform)" :key="account.id" class="flex items-center gap-4 py-4">
            <div class="relative shrink-0">
              <UAvatar
                :src="account.profile_picture_url || undefined"
                :alt="account.account_name"
                :icon="account.profile_picture_url ? undefined : platformConfig[platform].icon"
                size="lg"
              />
              <UIcon
                v-if="account.profile_picture_url"
                :name="platformConfig[platform].icon"
                class="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-md bg-white dark:bg-gray-800 ring-2 ring-white dark:ring-gray-800"
              />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-gray-900 dark:text-white">{{ account.account_name }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">@{{ account.account_handle }}</p>
            </div>
            <USelectMenu
              :model-value="account.client ?? 'house'"
              :options="[
                { label: 'House (agency-owned)', value: 'house' },
                ...clients.map((c) => ({ label: c.name, value: c.id })),
              ]"
              value-attribute="value"
              option-attribute="label"
              size="xs"
              class="w-48"
              @update:model-value="(v: string) => reassignAccountClient(account, v === 'house' ? null : v)"
            />
            <UBadge :color="getTokenStatus(account).color" variant="subtle" size="sm">
              {{ getTokenStatus(account).label }}
            </UBadge>
            <UDropdown
              :items="[
                [
                  { label: 'Reconnect', icon: 'i-lucide-refresh-cw', to: platformConfig[platform].connectPath, external: true },
                  ...(supportsBackfill(account)
                    ? [{
                        label: isBackfilling === account.id ? 'Fetching history…' : 'Fetch history',
                        icon: 'i-lucide-history',
                        click: () => openBackfillModal(account),
                        disabled: isBackfilling === account.id,
                      }]
                    : []),
                ],
                [{ label: 'Disconnect', icon: 'i-lucide-trash-2', click: () => confirmDelete(account) }],
              ]"
            >
              <UButton variant="ghost" icon="i-lucide-more-vertical" size="sm" :loading="isBackfilling === account.id" />
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
              <UIcon :name="platformConfig[platform].icon" class="w-6 h-6 shrink-0" />
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

            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Redirect URI (allowlist this exactly)</p>
              <code class="block px-3 py-2 bg-muted/40 rounded-md text-[12px] break-all">{{ fullRedirectUri(platform) }}</code>
            </div>

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
                    :class="env.required ? 'text-destructive dark:text-destructive' : 'text-muted-foreground'"
                  >{{ env.required ? 'required' : 'optional' }}</span>
                  <span v-if="env.note" class="text-[12px] text-muted-foreground">— {{ env.note }}</span>
                </li>
              </ul>
            </div>

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

    <UModal v-model="showBackfillModal">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <UIcon name="i-lucide-history" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 class="font-semibold text-gray-900 dark:text-white">Fetch historical insights</h3>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-gray-600 dark:text-gray-300">
          Pull daily account-level metrics and insights for up to
          <strong>{{ backfillDays }} days</strong> of history on
          <strong>{{ accountToBackfill?.account_name }}</strong>.
        </p>

        <div>
          <label class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">
            Days to fetch
          </label>
          <div class="flex gap-2">
            <UButton
              v-for="opt in [7, 14, 28, 60, 90]"
              :key="opt"
              size="xs"
              :variant="backfillDays === opt ? 'solid' : 'soft'"
              @click="backfillDays = opt"
            >{{ opt }}d</UButton>
          </div>
        </div>

        <div class="rounded-md bg-warning/10 dark:bg-warning/20 border border-warning/30 dark:border-warning/40 p-3 text-xs text-warning space-y-1">
          <p>
            <UIcon name="i-lucide-info" class="w-3.5 h-3.5 inline-block align-text-bottom mr-1" />
            Meta retains roughly 28 days of account-level insights — anything before that may come back empty.
          </p>
          <p>
            The fetch runs sequentially with 1-second pacing to stay under Graph API rate limits.
            Up to 25 recent posts are also fetched. Total run time: {{ Math.ceil((backfillDays + 25) * 1.1) }}s.
          </p>
          <p>Re-running is safe — already-captured days are skipped automatically.</p>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" @click="showBackfillModal = false">Cancel</UButton>
          <UButton color="primary" @click="runBackfill">
            Fetch {{ backfillDays }} days of history
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model="showDeleteModal">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-destructive/10 dark:bg-destructive/30 rounded-lg">
            <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-destructive dark:text-destructive" />
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
    </UModal>
  </div>
</template>
