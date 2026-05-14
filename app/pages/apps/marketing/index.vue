<script setup lang="ts">
/**
 * Marketing app — Apps Layout Phase 5.
 *
 * Single landing page with a pill-segmented floor strip:
 *   Pulse (default) | Campaigns | Email | Social | Audience
 *
 * Floor switching is in-place via `?floor=` query param so the shell never
 * remounts. Per-floor data fetches are lazy. Drill-downs from any floor
 * still push to canonical classic routes:
 *   - Campaign rows → `/marketing-timeline?campaign=<id>` (the only existing
 *     campaign detail surface — there is no `/marketing/[id]`).
 *   - Email templates → `/email/templates/<id>`.
 *   - Mailing lists → `/lists/<id>`.
 *   - Contacts → `/contacts/<id>`.
 *
 * Decisions documented for Phase 5:
 *   - Per-floor header action button (no dedicated Compose floor). The
 *     `Compose` floor would duplicate functionality already covered by
 *     the existing /social/compose, /email modal, and campaign-planner
 *     paths — a single context-aware action button keeps things tidy.
 *   - Mailing lists live under the Audience floor (alongside contact
 *     segments). They aren't large enough to warrant their own floor.
 *   - Recommendations live in Pulse via `MarketingFeedSection` — no
 *     duplicate "Recommendations" floor.
 *   - Detail pages are not rebuilt. Drilling reaches existing routes.
 */
import type { SocialPlatform, SocialAccountPublic, SocialPost } from '~~/shared/social';
import { useDebounceFn } from '@vueuse/core';
import { Button } from '~/components/ui/button';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Marketing | Earnest' });

const router = useRouter();
const route = useRoute();

// ── Floor strip ─────────────────────────────────────────────────────────────
type FloorKey = 'pulse' | 'campaigns' | 'email' | 'social' | 'audience';
const FLOOR_KEYS: FloorKey[] = ['pulse', 'campaigns', 'email', 'social', 'audience'];

const initialFloor: FloorKey = (() => {
  const v = route.query.floor;
  return typeof v === 'string' && FLOOR_KEYS.includes(v as FloorKey) ? (v as FloorKey) : 'pulse';
})();
const floor = ref<FloorKey>(initialFloor);

watch(floor, (next) => {
  router.replace({ query: { ...route.query, floor: next === 'pulse' ? undefined : next } });
});

const floors: Array<{ key: FloorKey; label: string; icon: string }> = [
  { key: 'pulse', label: 'Pulse', icon: 'lucide:activity' },
  { key: 'campaigns', label: 'Campaigns', icon: 'lucide:rocket' },
  { key: 'email', label: 'Email', icon: 'lucide:mail' },
  { key: 'social', label: 'Social', icon: 'lucide:share-2' },
  { key: 'audience', label: 'Audience', icon: 'lucide:users' },
];

// ── Common deps ─────────────────────────────────────────────────────────────
const { selectedOrg, currentOrg } = useOrganization();
const { selectedClient, currentClient } = useClients();
const { getStatusBadgeClasses } = useStatusStyle();

const PLATFORMS: SocialPlatform[] = ['instagram', 'linkedin', 'facebook', 'tiktok', 'threads'];

function formatNumber(n: number): string {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function relativeDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const ms = d.getTime() - Date.now();
  const days = Math.round(ms / 86400000);
  if (Math.abs(days) < 1) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}

function campaignStatusDot(s: string): string {
  if (s === 'active') return 'bg-emerald-500';
  if (s === 'paused') return 'bg-amber-500';
  if (s === 'completed') return 'bg-sky-500';
  return 'bg-muted-foreground/40';
}

function campaignBarColor(s: string): string {
  if (s === 'active') return 'bg-emerald-500';
  if (s === 'paused') return 'bg-amber-500';
  if (s === 'completed') return 'bg-sky-500';
  return 'bg-muted-foreground/40';
}

const SOCIAL_LOGOS: Record<SocialPlatform, string> = {
  instagram: 'logos:instagram-icon',
  facebook: 'logos:facebook',
  linkedin: 'logos:linkedin-icon',
  tiktok: 'logos:tiktok-icon',
  threads: 'lucide:at-sign',
};

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  threads: 'Threads',
};

// ── Pulse floor ─────────────────────────────────────────────────────────────
interface HealthSnapshot {
  healthScore: number;
  metrics: {
    totalContacts: number;
    subscribedContacts: number;
    contactGrowth: number;
    subscriptionRate: number;
    socialPostsLast30Days: number;
    connectedPlatforms: number;
    failedPosts: number;
    totalCampaigns: number;
    recentCampaigns: number;
    totalSubscribers: number;
    mailingLists: number;
  };
}

const pulseLoading = ref(false);
const pulseHealth = ref<HealthSnapshot | null>(null);
const pulseAccounts = ref<SocialAccountPublic[]>([]);
const pulseAnalytics = ref<any | null>(null);
const pulseRecentPosts = ref<any[]>([]);
const pulseScheduledPosts = ref<any[]>([]);
const pulseCampaigns = ref<any[]>([]);

async function fetchPulse() {
  if (!selectedOrg.value) return;
  pulseLoading.value = true;
  const orgId = selectedOrg.value;
  const sinceISO = new Date(Date.now() - 7 * 86400000).toISOString();

  await Promise.allSettled([
    $fetch('/api/marketing/health-snapshot', { query: { organizationId: orgId } })
      .then((r: any) => { pulseHealth.value = r as HealthSnapshot; })
      .catch(() => { pulseHealth.value = null; }),
    $fetch('/api/social/accounts')
      .then((r: any) => { pulseAccounts.value = (r?.data ?? []) as SocialAccountPublic[]; })
      .catch(() => { pulseAccounts.value = []; }),
    $fetch('/api/social/analytics')
      .then((r: any) => { pulseAnalytics.value = r?.data ?? null; })
      .catch(() => { pulseAnalytics.value = null; }),
    $fetch('/api/social/posts', { query: { status: 'published', limit: 30 } })
      .then((r: any) => {
        const posts = (r?.data ?? []) as any[];
        pulseRecentPosts.value = posts.filter((p) => {
          const ts = p.published_at || p.scheduled_at;
          return ts ? new Date(ts).toISOString() >= sinceISO : false;
        });
      })
      .catch(() => { pulseRecentPosts.value = []; }),
    $fetch('/api/social/posts', { query: { status: 'scheduled', limit: 30 } })
      .then((r: any) => { pulseScheduledPosts.value = (r?.data ?? []) as any[]; })
      .catch(() => { pulseScheduledPosts.value = []; }),
    $fetch('/api/marketing/campaigns', { query: { organizationId: orgId, type: 'campaign' } })
      .then((r: any) => {
        pulseCampaigns.value = ((r?.campaigns ?? []) as any[])
          .filter((c) => c.status === 'active' || c.status === 'paused');
      })
      .catch(() => { pulseCampaigns.value = []; }),
  ]);

  pulseLoading.value = false;
}

const pulseHealthScore = computed(() => pulseHealth.value?.healthScore ?? 0);
const pulseHealthTone = computed(() => {
  const s = pulseHealth.value?.healthScore;
  if (s === undefined) return 'neutral';
  if (s >= 70) return 'emerald';
  if (s >= 40) return 'amber';
  return 'rose';
});

const pulseTotalReach = computed(() => pulseAnalytics.value?.overview?.total_followers ?? 0);

const pulsePlatformTiles = computed(() => {
  const accountsByPlatform = new Map<SocialPlatform, SocialAccountPublic[]>();
  for (const a of pulseAccounts.value) {
    const list = accountsByPlatform.get(a.platform) || [];
    list.push(a);
    accountsByPlatform.set(a.platform, list);
  }

  const postsCountByPlatform = new Map<SocialPlatform, number>();
  for (const p of pulseRecentPosts.value) {
    for (const target of (p.platforms || [])) {
      postsCountByPlatform.set(target.platform, (postsCountByPlatform.get(target.platform) || 0) + 1);
    }
  }

  const nextScheduledByPlatform = new Map<SocialPlatform, string>();
  const sortedScheduled = [...pulseScheduledPosts.value].sort((a, b) => {
    const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
    const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
    return at - bt;
  });
  for (const p of sortedScheduled) {
    for (const target of (p.platforms || [])) {
      if (!nextScheduledByPlatform.has(target.platform)) {
        nextScheduledByPlatform.set(target.platform, p.scheduled_at);
      }
    }
  }

  const followersByAccount = new Map<string, number>();
  for (const a of (pulseAnalytics.value?.accounts ?? [])) {
    const m = a.metrics || {};
    const followers = m.followers_count ?? m.follower_count ?? 0;
    followersByAccount.set(a.account_id, followers);
  }

  return PLATFORMS.map((platform) => {
    const accounts = accountsByPlatform.get(platform) || [];
    const primary = accounts[0];
    const connected = !!primary && primary.status === 'active';
    const followers = primary ? (followersByAccount.get(primary.id) || 0) : 0;
    return {
      platform,
      connected,
      expired: !!primary && (primary.status === 'expired' || primary.is_token_expiring_soon),
      accountName: primary?.account_name || null,
      accountHandle: primary?.account_handle || null,
      followers,
      postsLastPeriod: postsCountByPlatform.get(platform) || 0,
      nextScheduledAt: nextScheduledByPlatform.get(platform) || null,
    };
  });
});

const pulseTopCampaigns = computed(() =>
  [...pulseCampaigns.value]
    .filter(c => c.status === 'active' || c.status === 'paused')
    .slice(0, 4)
    .map((c) => {
      const start = c.start_date ? new Date(c.start_date).getTime() : new Date(c.date_created).getTime();
      const end = c.end_date ? new Date(c.end_date).getTime() : start + 30 * 86400000;
      const now = Date.now();
      const total = Math.max(1, end - start);
      const elapsed = Math.max(0, Math.min(total, now - start));
      const progressPct = Math.round((elapsed / total) * 100);
      return {
        ...c,
        progressPct,
        nextMilestone: c.end_date ? `Ends ${relativeDate(c.end_date)}` : null,
      };
    }),
);

// ── Campaigns floor ─────────────────────────────────────────────────────────
const campaignsLoading = ref(false);
const campaignsList = ref<any[]>([]);
const campaignsStatusFilter = ref<'all' | 'active' | 'paused' | 'completed' | 'draft'>('all');

const campaignStatusItems = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Completed' },
  { key: 'draft', label: 'Draft' },
];

async function fetchCampaigns() {
  if (!selectedOrg.value) return;
  campaignsLoading.value = true;
  try {
    const r: any = await $fetch('/api/marketing/campaigns', {
      query: { organizationId: selectedOrg.value, type: 'campaign' },
    });
    campaignsList.value = (r?.campaigns ?? []) as any[];
  } catch {
    campaignsList.value = [];
  } finally {
    campaignsLoading.value = false;
  }
}

const filteredCampaigns = computed(() => {
  if (campaignsStatusFilter.value === 'all') return campaignsList.value;
  return campaignsList.value.filter(c => c.status === campaignsStatusFilter.value);
});

// ── Campaign slide-over (Phase 7 Track A) ───────────────────────────────────
// Quick-edit status / goal / dates without leaving the floor. Big edits still
// happen on /marketing-timeline (linked from the slide-over footer).
const slideOverCampaign = ref<any>(null);
const slideOverDraft = reactive<{ status: string; goal: string; start_date: string; end_date: string }>({
  status: '',
  goal: '',
  start_date: '',
  end_date: '',
});
const campaignSlideOpen = computed({
  get: () => !!slideOverCampaign.value,
  set: (v) => { if (!v) slideOverCampaign.value = null; },
});
const campaignSaving = ref(false);

const CAMPAIGN_STATUS_OPTIONS = ['draft', 'active', 'paused', 'completed'];

function toDateInput(s: string | null | undefined): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch { return ''; }
}

function openCampaignSlideOver(c: any) {
  slideOverCampaign.value = c;
  slideOverDraft.status = c.status || 'draft';
  slideOverDraft.goal = c.goal || '';
  slideOverDraft.start_date = toDateInput(c.start_date);
  slideOverDraft.end_date = toDateInput(c.end_date);
}

async function saveCampaignDraft() {
  if (!slideOverCampaign.value || campaignSaving.value) return;
  campaignSaving.value = true;
  try {
    await $fetch(`/api/marketing/campaigns/${slideOverCampaign.value.id}`, {
      method: 'PATCH',
      body: {
        status: slideOverDraft.status,
        goal: slideOverDraft.goal,
        start_date: slideOverDraft.start_date || null,
        end_date: slideOverDraft.end_date || null,
      },
    });
    // Refresh the lists so the floor reflects the new state
    await Promise.all([fetchCampaigns(), fetchPulse()]).catch(() => {});
    slideOverCampaign.value = null;
  } catch (err) {
    console.error('[apps/marketing] saveCampaignDraft failed', err);
  } finally {
    campaignSaving.value = false;
  }
}

// ── Email floor ─────────────────────────────────────────────────────────────
const { getTemplates } = useEmailTemplates();
const emailLoading = ref(false);
const emailTemplates = ref<any[]>([]);
const emailFilter = ref<'all' | 'draft' | 'published'>('all');

const emailFilterItems = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'published', label: 'Published' },
];

async function fetchEmailTemplates() {
  emailLoading.value = true;
  try {
    emailTemplates.value = await getTemplates();
  } catch {
    emailTemplates.value = [];
  } finally {
    emailLoading.value = false;
  }
}

const filteredEmailTemplates = computed(() => {
  if (emailFilter.value === 'all') return emailTemplates.value;
  return emailTemplates.value.filter((t) => (t.status || 'draft') === emailFilter.value);
});

const emailKpis = computed(() => {
  const templates = emailTemplates.value;
  const drafts = templates.filter((t) => (t.status || 'draft') === 'draft').length;
  const published = templates.filter((t) => t.status === 'published').length;
  const subscribers = pulseHealth.value?.metrics.totalSubscribers ?? 0;
  const lists = pulseHealth.value?.metrics.mailingLists ?? 0;
  return { drafts, published, subscribers, lists };
});

// ── Social floor ────────────────────────────────────────────────────────────
const socialLoading = ref(false);
const socialAccounts = ref<SocialAccountPublic[]>([]);
const socialPosts = ref<SocialPost[]>([]);
const socialPlatformFilter = ref<'all' | SocialPlatform>('all');
const socialStatusFilter = ref<'all' | 'scheduled' | 'published' | 'failed' | 'draft'>('all');

const socialPlatformItems = computed(() => [
  { key: 'all', label: 'All' },
  ...PLATFORMS.map((p) => ({ key: p, label: SOCIAL_LABELS[p] })),
]);

const socialStatusItems = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
  { key: 'draft', label: 'Draft' },
];

async function fetchSocial() {
  socialLoading.value = true;
  try {
    const [accountsRes, postsRes] = await Promise.allSettled([
      $fetch('/api/social/accounts'),
      $fetch('/api/social/posts', { query: { limit: 80 } }),
    ]);
    socialAccounts.value = accountsRes.status === 'fulfilled'
      ? ((accountsRes.value as any)?.data ?? []) as SocialAccountPublic[]
      : [];
    socialPosts.value = postsRes.status === 'fulfilled'
      ? ((postsRes.value as any)?.data ?? []) as SocialPost[]
      : [];
  } finally {
    socialLoading.value = false;
  }
}

const filteredSocialPosts = computed(() => {
  let posts = socialPosts.value;
  if (socialStatusFilter.value !== 'all') {
    posts = posts.filter((p) => p.status === socialStatusFilter.value);
  }
  if (socialPlatformFilter.value !== 'all') {
    const p = socialPlatformFilter.value;
    posts = posts.filter((post) => (post.platforms || []).some((pl: any) => pl.platform === p));
  }
  return posts;
});

const socialPostsByPlatform = computed(() => {
  const groups = new Map<SocialPlatform, SocialPost[]>();
  for (const p of filteredSocialPosts.value) {
    for (const target of (p.platforms || []) as any[]) {
      const arr = groups.get(target.platform) || [];
      if (!arr.find((existing) => existing.id === p.id)) arr.push(p);
      groups.set(target.platform, arr);
    }
  }
  return PLATFORMS
    .map((platform) => ({ platform, posts: groups.get(platform) || [] }))
    .filter((g) => g.posts.length);
});

function postEngagementSummary(p: any): { likes: number; comments: number; views: number } {
  let likes = 0, comments = 0, views = 0;
  for (const target of (p.platforms || []) as any[]) {
    const a = target.analytics || target.metrics || {};
    likes += Number(a.like_count ?? a.likes ?? 0) || 0;
    comments += Number(a.comments_count ?? a.comments ?? 0) || 0;
    views += Number(a.view_count ?? a.impressions ?? a.views ?? 0) || 0;
  }
  return { likes, comments, views };
}

function postPrimaryDate(p: any): string {
  return p.published_at || p.scheduled_at || p.date_created || '';
}

// ── Audience floor ──────────────────────────────────────────────────────────
const { getLists } = useMailingLists();
const { getContacts } = useContacts();

const audienceLoading = ref(false);
const audienceLists = ref<any[]>([]);
const audienceContactsTotal = ref(0);
const audienceSubscribed = ref(0);
const audienceUnsubscribed = ref(0);
const audienceProspects = ref(0);
const audienceClients = ref(0);
const audiencePartners = ref(0);

async function fetchAudience() {
  if (!selectedOrg.value) return;
  audienceLoading.value = true;
  try {
    const [lists, all, prospectsCount, clientsCount, partnersCount, unsubCount] = await Promise.all([
      getLists().catch(() => []),
      getContacts({ limit: 1, page: 1 }).catch(() => ({ data: [], total: 0 })),
      getContacts({ category: 'prospect', limit: 1, page: 1 }).catch(() => ({ data: [], total: 0 })),
      getContacts({ category: 'client', limit: 1, page: 1 }).catch(() => ({ data: [], total: 0 })),
      getContacts({ category: 'partner', limit: 1, page: 1 }).catch(() => ({ data: [], total: 0 })),
      getContacts({ status: 'unsubscribed', limit: 1, page: 1 }).catch(() => ({ data: [], total: 0 })),
    ]);
    audienceLists.value = lists;
    audienceContactsTotal.value = all.total;
    audienceProspects.value = prospectsCount.total;
    audienceClients.value = clientsCount.total;
    audiencePartners.value = partnersCount.total;
    audienceUnsubscribed.value = unsubCount.total;
    audienceSubscribed.value = pulseHealth.value?.metrics.subscribedContacts ?? Math.max(0, all.total - unsubCount.total);
  } finally {
    audienceLoading.value = false;
  }
}

// ── Lazy-load per floor ─────────────────────────────────────────────────────
const pulseLoaded = ref(false);
const campaignsLoaded = ref(false);
const emailLoaded = ref(false);
const socialLoaded = ref(false);
const audienceLoaded = ref(false);

watch(
  floor,
  (next) => {
    if (next === 'pulse' && !pulseLoaded.value) {
      pulseLoaded.value = true;
      fetchPulse();
    }
    if (next === 'campaigns' && !campaignsLoaded.value) {
      campaignsLoaded.value = true;
      fetchCampaigns();
    }
    if (next === 'email' && !emailLoaded.value) {
      emailLoaded.value = true;
      fetchEmailTemplates();
    }
    if (next === 'social' && !socialLoaded.value) {
      socialLoaded.value = true;
      fetchSocial();
    }
    if (next === 'audience' && !audienceLoaded.value) {
      audienceLoaded.value = true;
      // Pulse health drives subscriber counts on Audience; warm it lazily.
      if (!pulseLoaded.value) {
        pulseLoaded.value = true;
        fetchPulse().then(fetchAudience);
      } else {
        fetchAudience();
      }
    }
  },
  { immediate: true },
);

// Refetch on org/client changes when a floor is already loaded.
watch([selectedOrg, selectedClient], () => {
  if (pulseLoaded.value) fetchPulse();
  if (campaignsLoaded.value) fetchCampaigns();
  if (emailLoaded.value) fetchEmailTemplates();
  if (socialLoaded.value) fetchSocial();
  if (audienceLoaded.value) fetchAudience();
});

// ── Header action button ────────────────────────────────────────────────────
const headerAction = computed(() => {
  if (floor.value === 'pulse' || floor.value === 'campaigns') {
    return {
      label: 'New Campaign',
      icon: 'lucide:rocket',
      onClick: () => router.push('/marketing#planner'),
    };
  }
  if (floor.value === 'email') {
    return {
      label: 'New Email',
      icon: 'lucide:plus',
      onClick: () => router.push('/email'),
    };
  }
  if (floor.value === 'social') {
    return {
      label: 'New Post',
      icon: 'lucide:plus',
      onClick: () => router.push('/social/compose'),
    };
  }
  if (floor.value === 'audience') {
    return {
      label: 'New List',
      icon: 'lucide:plus',
      onClick: () => router.push('/lists'),
    };
  }
  return null;
});

const scopeLabel = computed(() => {
  const client = currentClient.value as { name?: string } | null;
  if (client?.name) return client.name;
  const org = currentOrg.value as { name?: string } | null;
  return org?.name || 'your organization';
});
</script>

<template>
  <div class="apps-page">
    <AppHeader title="Marketing" app-id="marketing">
      <template #actions>
        <Button v-if="headerAction" size="sm" @click="headerAction.onClick">
          <Icon :name="headerAction.icon" class="w-4 h-4 mr-1" />
          {{ headerAction.label }}
        </Button>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <AppFloorStrip v-model="floor" :items="floors" aria-label="Marketing sections" />

      <AppIntroCard app-id="marketing" />

      <!-- ── Pulse floor ──────────────────────────────────────────────── -->
      <template v-if="floor === 'pulse'">
        <div v-if="pulseLoading && !pulseHealth" class="flex items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
          <span class="text-sm text-muted-foreground">Loading…</span>
        </div>

        <template v-else>
          <!-- KPI strip -->
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <MarketingKPICard
              label="Marketing Health"
              :value="pulseHealth ? String(pulseHealthScore) : '—'"
              :tone="pulseHealthTone"
              icon="lucide:activity"
              :loading="pulseLoading"
            />
            <MarketingKPICard
              label="Posts (30d)"
              :value="pulseHealth ? String(pulseHealth.metrics.socialPostsLast30Days) : '—'"
              tone="violet"
              icon="lucide:share-2"
              :loading="pulseLoading"
            />
            <MarketingKPICard
              label="Email Subscribers"
              :value="pulseHealth ? formatNumber(pulseHealth.metrics.totalSubscribers) : '—'"
              tone="sky"
              icon="lucide:mail"
              :loading="pulseLoading"
            />
            <MarketingKPICard
              label="Social Reach"
              :value="formatNumber(pulseTotalReach)"
              tone="fuchsia"
              icon="lucide:users"
              :loading="pulseLoading"
            />
            <MarketingKPICard
              label="Contacts"
              :value="pulseHealth ? formatNumber(pulseHealth.metrics.totalContacts) : '—'"
              :delta="pulseHealth?.metrics.contactGrowth ? `+${pulseHealth.metrics.contactGrowth} this month` : null"
              tone="emerald"
              icon="lucide:user-round"
              :loading="pulseLoading"
            />
          </div>

          <!-- Recommendation feed (reused from /marketing) -->
          <div class="ios-card p-5 mb-5">
            <MarketingFeedSection />
          </div>

          <!-- Active campaigns (Clean Gantt) -->
          <div class="ios-card p-5 mb-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Active Campaigns
                <span v-if="pulseTopCampaigns.length" class="text-foreground ml-1">({{ pulseTopCampaigns.length }})</span>
              </h3>
              <button
                class="text-xs text-primary hover:underline"
                @click="floor = 'campaigns'"
              >
                View all →
              </button>
            </div>

            <div v-if="!pulseTopCampaigns.length" class="py-6 text-center">
              <Icon name="lucide:rocket" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p class="text-xs text-foreground font-medium mb-1">No active campaigns</p>
              <p class="text-[10px] text-muted-foreground">Plan one with the Campaign Planner.</p>
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="c in pulseTopCampaigns"
                :key="c.id"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 transition-colors overflow-hidden cursor-pointer"
                @click="openCampaignSlideOver(c)"
              >
                <div class="flex items-center gap-2 px-3 py-2">
                  <span :class="['w-2 h-2 rounded-full shrink-0', campaignStatusDot(c.status)]" />
                  <span class="text-xs font-medium text-foreground truncate flex-1">{{ c.title }}</span>
                  <span
                    class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium"
                    :class="getStatusBadgeClasses(c.status)"
                  >
                    {{ c.status }}
                  </span>
                </div>
                <div class="h-3 bg-muted/30 relative">
                  <div
                    class="h-full transition-all"
                    :class="campaignBarColor(c.status)"
                    :style="{ width: `${c.progressPct}%`, opacity: c.status === 'paused' ? 0.4 : 0.85 }"
                  />
                </div>
                <div class="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground">
                  <span v-if="c.nextMilestone">Next: {{ c.nextMilestone }}</span>
                  <span v-else>Created {{ relativeDate(c.date_created) }}</span>
                  <span class="tabular-nums">{{ c.progressPct }}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Last 7 days activity grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="ios-card p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Posts
                  <span v-if="pulseRecentPosts.length" class="text-foreground ml-1">({{ pulseRecentPosts.length }})</span>
                </h3>
                <button class="text-xs text-primary hover:underline" @click="floor = 'social'">
                  View all →
                </button>
              </div>
              <div v-if="!pulseRecentPosts.length" class="text-sm text-muted-foreground/70 py-4 text-center">
                No posts in the last 7 days.
              </div>
              <div v-else class="space-y-0.5">
                <div
                  v-for="p in pulseRecentPosts.slice(0, 6)"
                  :key="p.id"
                  class="flex items-center gap-2 py-2 px-2 -mx-2 rounded-md hover:bg-muted/30 cursor-pointer transition-colors"
                  @click="router.push(`/social`)"
                >
                  <Icon
                    v-for="target in (p.platforms || []).slice(0, 3)"
                    :key="target.account_id"
                    :name="SOCIAL_LOGOS[target.platform as SocialPlatform] || 'lucide:share-2'"
                    class="w-3.5 h-3.5 shrink-0"
                  />
                  <p class="text-sm text-foreground truncate flex-1">{{ p.caption?.slice(0, 80) || 'Untitled post' }}</p>
                  <span class="text-[10px] text-muted-foreground shrink-0">
                    {{ relativeDate(p.published_at || p.scheduled_at) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="ios-card p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Channels
                </h3>
                <button class="text-xs text-primary hover:underline" @click="floor = 'social'">
                  Manage →
                </button>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MarketingPlatformTile
                  v-for="tile in pulsePlatformTiles"
                  :key="tile.platform"
                  :tile="tile"
                />
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- ── Campaigns floor ──────────────────────────────────────────── -->
      <template v-else-if="floor === 'campaigns'">
        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <UTabs
            v-model="campaignsStatusFilter"
            :items="campaignStatusItems"
            class="w-fit"
          />
          <span class="text-xs text-muted-foreground ml-auto">
            {{ scopeLabel }}
          </span>
        </div>

        <div v-if="campaignsLoading && !campaignsList.length" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading campaigns…</p>
        </div>

        <div v-else-if="!filteredCampaigns.length" class="flex flex-col items-center justify-center py-24 gap-4">
          <Icon name="lucide:rocket" class="w-12 h-12 text-muted-foreground/40" />
          <div class="text-center">
            <p class="text-sm font-medium text-muted-foreground">No campaigns found</p>
            <p class="text-xs text-muted-foreground/70 mt-1">
              Plan one with the Campaign Planner on the classic Marketing page.
            </p>
          </div>
          <Button size="sm" variant="outline" @click="router.push('/marketing')">
            <Icon name="lucide:rocket" class="w-4 h-4 mr-1" />
            Open Planner
          </Button>
        </div>

        <div v-else class="ios-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/50">
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Campaign</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Start</th>
                  <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">End</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="c in filteredCampaigns"
                  :key="c.id"
                  class="border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  @click="openCampaignSlideOver(c)"
                >
                  <td class="py-3 px-4">
                    <p class="font-medium text-foreground">{{ c.title }}</p>
                    <p v-if="c.goal" class="text-[11px] text-muted-foreground truncate max-w-md">{{ c.goal }}</p>
                  </td>
                  <td class="py-3 px-4">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                      :class="getStatusBadgeClasses(c.status)"
                    >
                      {{ c.status }}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-muted-foreground capitalize">{{ c.type || '—' }}</td>
                  <td class="py-3 px-4 text-muted-foreground">{{ c.start_date ? relativeDate(c.start_date) : '—' }}</td>
                  <td class="py-3 px-4 text-muted-foreground">{{ c.end_date ? relativeDate(c.end_date) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ── Email floor ──────────────────────────────────────────────── -->
      <template v-else-if="floor === 'email'">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="ios-card p-4">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Drafts</p>
            <p class="text-2xl font-bold text-foreground">{{ emailKpis.drafts }}</p>
          </div>
          <div class="ios-card p-4">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Published</p>
            <p class="text-2xl font-bold text-foreground">{{ emailKpis.published }}</p>
          </div>
          <div class="ios-card p-4">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Subscribers</p>
            <p class="text-2xl font-bold text-foreground">{{ formatNumber(emailKpis.subscribers) }}</p>
          </div>
          <div class="ios-card p-4">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Lists</p>
            <p class="text-2xl font-bold text-foreground">{{ emailKpis.lists }}</p>
          </div>
        </div>

        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <UTabs
            v-model="emailFilter"
            :items="emailFilterItems"
            class="w-fit"
          />
          <NuxtLink to="/email" class="text-xs text-primary hover:underline ml-auto">
            Open classic Email →
          </NuxtLink>
        </div>

        <div v-if="emailLoading && !emailTemplates.length" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading templates…</p>
        </div>

        <div v-else-if="!filteredEmailTemplates.length" class="flex flex-col items-center justify-center py-24 gap-4">
          <Icon name="lucide:mail-plus" class="w-12 h-12 text-muted-foreground/40" />
          <div class="text-center">
            <p class="text-sm font-medium text-muted-foreground">No email templates yet</p>
            <p class="text-xs text-muted-foreground/70 mt-1">Create your first template to start sending campaigns.</p>
          </div>
          <Button size="sm" @click="router.push('/email')">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
            New Email
          </Button>
        </div>

        <div v-else class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="tpl in filteredEmailTemplates"
            :key="tpl.id"
            class="ios-card p-4 cursor-pointer group"
            @click="router.push(`/email/templates/${tpl.id}`)"
          >
            <div class="flex items-start justify-between mb-3">
              <div
                class="w-9 h-9 rounded-xl flex items-center justify-center"
                :class="tpl.type === 'newsletter' ? 'bg-primary/5' : 'bg-blue-500/5'"
              >
                <Icon
                  :name="tpl.type === 'newsletter' ? 'lucide:newspaper' : 'lucide:mail'"
                  class="w-4 h-4"
                  :class="tpl.type === 'newsletter' ? 'text-primary/60' : 'text-blue-500/60'"
                />
              </div>
              <span
                class="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                :class="getStatusBadgeClasses(tpl.status || 'draft')"
              >
                {{ tpl.status || 'draft' }}
              </span>
            </div>
            <h3 class="text-sm font-semibold text-foreground mb-0.5 group-hover:text-primary transition-colors">
              {{ tpl.name }}
            </h3>
            <p class="text-[10px] text-muted-foreground capitalize">{{ tpl.type || 'newsletter' }}</p>
          </div>
        </div>
      </template>

      <!-- ── Social floor ─────────────────────────────────────────────── -->
      <template v-else-if="floor === 'social'">
        <!-- Account chips -->
        <div v-if="socialAccounts.length" class="flex flex-wrap gap-2 mb-5">
          <div
            v-for="a in socialAccounts"
            :key="a.id"
            class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs"
          >
            <Icon :name="SOCIAL_LOGOS[a.platform] || 'lucide:share-2'" class="w-3.5 h-3.5" />
            <span class="font-medium">{{ a.account_name }}</span>
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="a.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'"
            />
          </div>
          <NuxtLink
            to="/social/settings"
            class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Icon name="lucide:plus" class="w-3 h-3" />
            Connect
          </NuxtLink>
        </div>

        <!-- Filters -->
        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <UTabs
            v-model="socialStatusFilter"
            :items="socialStatusItems"
            class="w-fit"
          />
          <UTabs
            v-model="socialPlatformFilter"
            :items="socialPlatformItems"
            class="w-fit"
          />
          <NuxtLink to="/social" class="text-xs text-primary hover:underline ml-auto">
            Open classic Social →
          </NuxtLink>
        </div>

        <div v-if="socialLoading && !socialPosts.length" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading posts…</p>
        </div>

        <div v-else-if="!socialPostsByPlatform.length" class="flex flex-col items-center justify-center py-24 gap-4">
          <Icon name="lucide:share-2" class="w-12 h-12 text-muted-foreground/40" />
          <div class="text-center">
            <p class="text-sm font-medium text-muted-foreground">No posts yet</p>
            <p class="text-xs text-muted-foreground/70 mt-1">
              {{ socialAccounts.length ? 'Compose your first post.' : 'Connect a social account to start.' }}
            </p>
          </div>
          <Button size="sm" @click="router.push(socialAccounts.length ? '/social/compose' : '/social/settings')">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
            {{ socialAccounts.length ? 'New Post' : 'Connect Account' }}
          </Button>
        </div>

        <div v-else class="space-y-6">
          <div
            v-for="group in socialPostsByPlatform"
            :key="group.platform"
            class="ios-card p-5"
          >
            <div class="flex items-center gap-2 mb-3">
              <Icon :name="SOCIAL_LOGOS[group.platform]" class="w-5 h-5" />
              <h3 class="text-sm font-semibold text-foreground">{{ SOCIAL_LABELS[group.platform] }}</h3>
              <span class="text-[10px] text-muted-foreground ml-1">{{ group.posts.length }} {{ group.posts.length === 1 ? 'post' : 'posts' }}</span>
            </div>

            <div class="space-y-2">
              <div
                v-for="post in group.posts.slice(0, 6)"
                :key="`${group.platform}-${post.id}`"
                class="flex items-start gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/30 cursor-pointer transition-colors"
                @click="router.push(`/social`)"
              >
                <div class="w-10 h-10 rounded-lg bg-muted/30 overflow-hidden flex-shrink-0">
                  <img
                    v-if="post.thumbnail_url"
                    :src="post.thumbnail_url"
                    :alt="post.caption"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <Icon :name="SOCIAL_LOGOS[group.platform]" class="w-4 h-4 text-muted-foreground/50" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-foreground line-clamp-2">{{ post.caption || 'Untitled' }}</p>
                  <div class="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span
                      class="inline-flex items-center rounded-full px-1.5 py-0.5 font-medium capitalize"
                      :class="getStatusBadgeClasses(post.status)"
                    >
                      {{ post.status }}
                    </span>
                    <span v-if="postPrimaryDate(post)">{{ relativeDate(postPrimaryDate(post)) }}</span>
                    <template v-if="postEngagementSummary(post).likes || postEngagementSummary(post).views">
                      <span v-if="postEngagementSummary(post).likes" class="inline-flex items-center gap-1">
                        <Icon name="lucide:heart" class="w-3 h-3" />
                        {{ formatNumber(postEngagementSummary(post).likes) }}
                      </span>
                      <span v-if="postEngagementSummary(post).comments" class="inline-flex items-center gap-1">
                        <Icon name="lucide:message-circle" class="w-3 h-3" />
                        {{ formatNumber(postEngagementSummary(post).comments) }}
                      </span>
                      <span v-if="postEngagementSummary(post).views" class="inline-flex items-center gap-1">
                        <Icon name="lucide:eye" class="w-3 h-3" />
                        {{ formatNumber(postEngagementSummary(post).views) }}
                      </span>
                    </template>
                  </div>
                </div>
              </div>

              <button
                v-if="group.posts.length > 6"
                class="w-full text-xs text-primary hover:underline pt-2 border-t border-border/30"
                @click="router.push(`/social?platform=${group.platform}`)"
              >
                View all {{ group.posts.length }} on {{ SOCIAL_LABELS[group.platform] }} →
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Audience floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'audience'">
        <div v-if="audienceLoading && !audienceContactsTotal" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading audience…</p>
        </div>

        <template v-else>
          <!-- Segment KPIs -->
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Total Contacts</p>
              <p class="text-2xl font-bold text-foreground">{{ formatNumber(audienceContactsTotal) }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Subscribed</p>
              <p class="text-2xl font-bold text-emerald-500">{{ formatNumber(audienceSubscribed) }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Prospects</p>
              <p class="text-2xl font-bold text-foreground">{{ formatNumber(audienceProspects) }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Clients</p>
              <p class="text-2xl font-bold text-foreground">{{ formatNumber(audienceClients) }}</p>
            </div>
            <div class="ios-card p-4">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Partners</p>
              <p class="text-2xl font-bold text-foreground">{{ formatNumber(audiencePartners) }}</p>
            </div>
          </div>

          <!-- Mailing lists -->
          <div class="ios-card p-5 mb-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mailing Lists
                <span v-if="audienceLists.length" class="text-foreground ml-1">({{ audienceLists.length }})</span>
              </h3>
              <NuxtLink to="/lists" class="text-xs text-primary hover:underline">Manage →</NuxtLink>
            </div>

            <div v-if="!audienceLists.length" class="py-6 text-center">
              <Icon name="lucide:list" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p class="text-xs text-foreground font-medium mb-1">No mailing lists yet</p>
              <p class="text-[10px] text-muted-foreground mb-3">Build a list from your contacts to start sending.</p>
              <Button size="sm" variant="outline" @click="router.push('/lists')">
                <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
                New List
              </Button>
            </div>

            <div v-else class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="list in audienceLists"
                :key="list.id"
                class="rounded-xl border border-border/40 bg-card/40 p-4 cursor-pointer hover:bg-muted/30 transition-colors group"
                @click="router.push(`/lists/${list.id}`)"
              >
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Icon name="lucide:users" class="w-4 h-4 text-blue-500/70" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <h4 class="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {{ list.name }}
                    </h4>
                    <p class="text-[10px] text-muted-foreground">{{ list.subscriber_count || 0 }} subscribers</p>
                  </div>
                </div>
                <p v-if="list.description" class="text-xs text-muted-foreground line-clamp-2">{{ list.description }}</p>
                <div v-if="list.double_opt_in" class="mt-2">
                  <span class="text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                    Double opt-in
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Segments shortcut -->
          <div class="ios-card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Segments</h3>
              <NuxtLink to="/contacts" class="text-xs text-primary hover:underline">Open Contacts →</NuxtLink>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <NuxtLink
                to="/contacts?category=prospect"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Prospects</span>
                <span class="tabular-nums text-muted-foreground">{{ formatNumber(audienceProspects) }}</span>
              </NuxtLink>
              <NuxtLink
                to="/contacts?category=client"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Clients</span>
                <span class="tabular-nums text-muted-foreground">{{ formatNumber(audienceClients) }}</span>
              </NuxtLink>
              <NuxtLink
                to="/contacts?category=partner"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Partners</span>
                <span class="tabular-nums text-muted-foreground">{{ formatNumber(audiencePartners) }}</span>
              </NuxtLink>
              <NuxtLink
                to="/contacts?status=unsubscribed"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Unsubscribed</span>
                <span class="tabular-nums text-muted-foreground">{{ formatNumber(audienceUnsubscribed) }}</span>
              </NuxtLink>
              <NuxtLink
                to="/contacts?view=insights"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Insights</span>
                <Icon name="lucide:bar-chart-2" class="w-3.5 h-3.5 text-muted-foreground" />
              </NuxtLink>
              <NuxtLink
                to="/contacts/import"
                class="rounded-xl border border-dashed border-border bg-transparent hover:bg-muted/20 px-3 py-2.5 transition-colors flex items-center justify-between text-xs text-muted-foreground hover:text-foreground"
              >
                <span class="font-medium">Import CSV</span>
                <Icon name="lucide:upload" class="w-3.5 h-3.5" />
              </NuxtLink>
            </div>
          </div>
        </template>
      </template>
    </LayoutPageContainer>

    <!-- Campaign quick-edit slide-over (Phase 7 Track A) -->
    <ClientOnly>
      <Teleport to="#app-slide-over-root">
        <AppSlideOver
          v-model="campaignSlideOpen"
          :title="slideOverCampaign?.title || 'Campaign'"
        >
          <div v-if="slideOverCampaign" class="space-y-5">
            <div>
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
              <div class="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-card p-0.5">
                <button
                  v-for="opt in CAMPAIGN_STATUS_OPTIONS"
                  :key="opt"
                  type="button"
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors"
                  :class="slideOverDraft.status === opt
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'"
                  @click="slideOverDraft.status = opt"
                >
                  {{ opt }}
                </button>
              </div>
            </div>

            <div>
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Goal</label>
              <textarea
                v-model="slideOverDraft.goal"
                rows="3"
                class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="What outcome should this campaign drive?"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Start</label>
                <input
                  v-model="slideOverDraft.start_date"
                  type="date"
                  class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label class="text-[10px] uppercase tracking-wider text-muted-foreground">End</label>
                <input
                  v-model="slideOverDraft.end_date"
                  type="date"
                  class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div class="flex items-center justify-between pt-3 border-t border-border/30">
              <NuxtLink
                :to="`/marketing-timeline?campaign=${slideOverCampaign.id}`"
                class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open in timeline
                <Icon name="lucide:external-link" class="w-3 h-3" />
              </NuxtLink>
              <Button size="sm" :disabled="campaignSaving" @click="saveCampaignDraft">
                <Icon v-if="campaignSaving" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
                Save
              </Button>
            </div>
          </div>
        </AppSlideOver>
      </Teleport>
    </ClientOnly>
  </div>
</template>

<style scoped>
.apps-page {
  @apply flex flex-col min-h-full;
}
</style>