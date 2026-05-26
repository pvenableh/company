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
import SocialSettingsSurface from '~/components/Social/SettingsSurface.vue';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Marketing | Earnest' });

const router = useRouter();

// Email template editor — lifted into the universal slide-over stack as
// a fullscreen panel (EmailTemplatePanel + AppSlideOverShell fullscreen
// mode). The shell drops its chrome + uncaps the panel max-width via
// :has() so NewsletterBlockBuilder fills the viewport like a route, but
// the user stays inside the apps shell.
const emailTemplateSlide = useAppSlideOver('email-template');
function openEmailTemplate(id: string) {
  emailTemplateSlide.open(String(id));
}
const route = useRoute();
const toast = useToast();

// ── Floor strip ─────────────────────────────────────────────────────────────
type FloorKey = 'pulse' | 'campaigns' | 'email' | 'accounts' | 'studio' | 'audience';
const FLOOR_KEYS: FloorKey[] = ['pulse', 'campaigns', 'email', 'accounts', 'studio', 'audience'];

const initialFloor: FloorKey = (() => {
  const v = route.query.floor;
  // Legacy `?floor=social` redirects into Accounts so old bookmarks land somewhere.
  if (v === 'social') return 'accounts';
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
  { key: 'accounts', label: 'Accounts', icon: 'lucide:share-2' },
  { key: 'studio', label: 'Studio', icon: 'lucide:palette' },
  { key: 'audience', label: 'Audience', icon: 'lucide:users' },
];

// Accounts floor sub-views (`?view=overview|settings`). Settings is the
// in-app home of the legacy `/social/settings` page.
type AccountsView = 'overview' | 'settings';
const ACCOUNTS_VIEWS: AccountsView[] = ['overview', 'settings'];
const accountsView = ref<AccountsView>(
  (route.query.view === 'settings' ? 'settings' : 'overview') as AccountsView,
);
const accountsViewItems = [
  { key: 'overview' as const, label: 'Overview', icon: 'lucide:layout-grid' },
  { key: 'settings' as const, label: 'Settings', icon: 'lucide:settings' },
];

watch(accountsView, (next) => {
  if (floor.value !== 'accounts') return;
  router.replace({ query: { ...route.query, view: next === 'overview' ? undefined : next } });
});
watch(() => route.query.view, (v) => {
  if (floor.value !== 'accounts') return;
  const next: AccountsView = v === 'settings' ? 'settings' : 'overview';
  if (accountsView.value !== next) accountsView.value = next;
});

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
  if (s === 'active') return 'bg-success';
  if (s === 'paused') return 'bg-warning';
  if (s === 'completed') return 'bg-info';
  return 'bg-muted-foreground/40';
}

function campaignBarColor(s: string): string {
  if (s === 'active') return 'bg-success';
  if (s === 'paused') return 'bg-warning';
  if (s === 'completed') return 'bg-info';
  return 'bg-muted-foreground/40';
}

const SOCIAL_LOGOS: Record<SocialPlatform, string> = {
  instagram: 'logos:instagram-icon',
  facebook: 'logos:facebook',
  linkedin: 'logos:linkedin-icon',
  tiktok: 'logos:tiktok-icon',
  threads: 'lucide:at-sign',
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

// ── Campaign slide-over (URL-bound via useAppSlideOver) ─────────────────────
// Quick-edit lives in `components/apps/panels/CampaignPanel.vue`, rendered
// by the shell-level <AppsAppSlideOverStack>. The panel bumps a shared
// `marketing-campaigns-refresh` useState counter on save; we react here so
// the floor list reflects new statuses without remounting.
const campaignSlide = useAppSlideOver('marketing-campaign');
const campaignRefreshSignal = useState<number>('marketing-campaigns-refresh', () => 0);

function openCampaignSlideOver(c: any) {
  campaignSlide.open(String(c.id));
}

// Social post slide-over — keeps Pulse drilldowns inside the apps layout
// instead of bouncing to /social.
const socialPostSlide = useAppSlideOver('social-post');
function openSocialPostSlideOver(post: any) {
  socialPostSlide.open(String(post.id));
}

// Compose entry — navigates into the Studio floor's Composition Canvas
// with a create-mode social composer pre-opened. From the Pulse floor
// the canvas isn't mounted, so the URL helper handles both the floor
// switch and the z=3 reconcile in one push.
function openComposeSlideOver() {
  openCanvasCompose('social');
}

// Mailing-list slide-over — keeps list edit inside the apps layout instead
// of bouncing to /lists/[id]. New-list modal is rendered inline below.
const mailingListSlide = useAppSlideOver('mailing-list');
const showNewListModal = ref(false);

// Campaign Planner slide-over — lifted from /marketing#planner. Singleton
// create flow so the id is the sentinel '_'.
const campaignPlannerSlide = useAppSlideOver('campaign-planner');

const importContactsSlide = useAppSlideOver('import-contacts');
function openImportContactsPanel() {
  importContactsSlide.open('new');
}

// New-email bottom sheet — lifted from /email's New Template modal so the
// user doesn't get dumped on the legacy landing page two hops before the
// create flow.
const showNewEmailSheet = ref(false);
const mailingListRefreshSignal = useState<number>('mailing-lists-refresh', () => 0);
function openMailingListSlideOver(list: any, ev?: MouseEvent) {
  const flipFrom = flipPayloadFrom(ev?.currentTarget as HTMLElement | null | undefined);
  mailingListSlide.open(String(list.id), { flipFrom });
}
function onListCreated() {
  showNewListModal.value = false;
  if (audienceLoaded.value) fetchAudience();
}
watch(mailingListRefreshSignal, () => {
  if (audienceLoaded.value) fetchAudience();
});

watch(campaignRefreshSignal, () => {
  Promise.all([fetchCampaigns(), fetchPulse()]).catch(() => {});
});

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

// SendGrid event aggregates + per-campaign comparison rows over the
// active range. Replaces the standalone `/email/activity` page as the
// command-center surface for email performance.
const emailRange = ref<7 | 30 | 90>(30);
const EMAIL_RANGES = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
] as const;

const emailEventsRaw = ref<any[]>([]);
const emailCampaignsRaw = ref<any[]>([]);
const emailEventsLoading = ref(false);
const emailEventItems = useDirectusItems('email_events');
const emailRecordItems = useDirectusItems('emails');

type EmailSort = 'sent_at' | 'total_sent' | 'openRate' | 'clickRate' | 'bounceRate';
const emailSortBy = ref<EmailSort>('sent_at');
const emailSortDir = ref<'asc' | 'desc'>('desc');

function toggleEmailSort(column: EmailSort) {
  if (emailSortBy.value === column) {
    emailSortDir.value = emailSortDir.value === 'desc' ? 'asc' : 'desc';
  } else {
    emailSortBy.value = column;
    emailSortDir.value = column === 'sent_at' ? 'desc' : 'desc';
  }
}

async function fetchEmailEvents() {
  if (!selectedOrg.value) return;
  emailEventsLoading.value = true;
  const since = new Date(Date.now() - emailRange.value * 86400000).toISOString();
  try {
    const [evs, camps] = await Promise.all([
      emailEventItems.list({
        fields: ['id', 'event', 'recipient', 'timestamp', 'email_id'],
        filter: {
          _and: [
            { organization: { _eq: selectedOrg.value } },
            { timestamp: { _gte: since } },
          ],
        },
        sort: ['-timestamp'],
        limit: 1000,
      }),
      emailRecordItems.list({
        fields: ['id', 'name', 'subject', 'sent_at', 'total_recipients', 'total_sent', 'total_failed'],
        filter: {
          _and: [
            { organization: { _eq: selectedOrg.value } },
            { sent_at: { _gte: since } },
          ],
        },
        sort: ['-sent_at'],
        limit: 100,
      }),
    ]);
    emailEventsRaw.value = (evs as any[]) || [];
    emailCampaignsRaw.value = (camps as any[]) || [];
  } catch {
    emailEventsRaw.value = [];
    emailCampaignsRaw.value = [];
  } finally {
    emailEventsLoading.value = false;
  }
}

watch(emailRange, () => {
  if (emailLoaded.value) fetchEmailEvents();
});

const emailEngagement = computed(() => {
  const counts: Record<string, number> = {};
  const uniqueOpens = new Set<string>();
  const uniqueClicks = new Set<string>();
  for (const e of emailEventsRaw.value) {
    const k = e.event || 'unknown';
    counts[k] = (counts[k] || 0) + 1;
    if (k === 'open' && e.recipient) uniqueOpens.add(e.recipient);
    if (k === 'click' && e.recipient) uniqueClicks.add(e.recipient);
  }
  const delivered = counts.delivered || 0;
  const bounces = (counts.bounce || 0) + (counts.dropped || 0);
  const openRate = delivered ? Math.round((uniqueOpens.size / delivered) * 100) : 0;
  const clickRate = delivered ? Math.round((uniqueClicks.size / delivered) * 100) : 0;
  return {
    delivered,
    bounces,
    openRate,
    clickRate,
    uniqueOpens: uniqueOpens.size,
    uniqueClicks: uniqueClicks.size,
    totalEvents: emailEventsRaw.value.length,
  };
});

interface EmailCampaignRow {
  id: string | number;
  name: string;
  subject: string | null;
  sent_at: string | null;
  total_sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  bounces: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

const emailCampaignRows = computed<EmailCampaignRow[]>(() => {
  const byCampaign = new Map<string | number, {
    id: string | number;
    name: string;
    subject: string | null;
    sent_at: string | null;
    total_sent: number;
    delivered: number;
    bounces: number;
    uniqueOpens: Set<string>;
    uniqueClicks: Set<string>;
  }>();

  for (const c of emailCampaignsRaw.value) {
    byCampaign.set(c.id, {
      id: c.id,
      name: c.name || `Campaign #${c.id}`,
      subject: c.subject,
      sent_at: c.sent_at,
      total_sent: c.total_sent || 0,
      delivered: 0,
      bounces: 0,
      uniqueOpens: new Set(),
      uniqueClicks: new Set(),
    });
  }

  for (const ev of emailEventsRaw.value) {
    const cid = (ev.email_id && typeof ev.email_id === 'object' ? ev.email_id.id : ev.email_id) ?? null;
    if (cid == null) continue;
    const row = byCampaign.get(cid);
    if (!row) continue;
    if (ev.event === 'delivered') row.delivered++;
    else if (ev.event === 'open' && ev.recipient) row.uniqueOpens.add(ev.recipient);
    else if (ev.event === 'click' && ev.recipient) row.uniqueClicks.add(ev.recipient);
    else if (ev.event === 'bounce' || ev.event === 'dropped') row.bounces++;
  }

  const rows: EmailCampaignRow[] = Array.from(byCampaign.values()).map((row) => {
    const denom = row.delivered || row.total_sent || 0;
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      sent_at: row.sent_at,
      total_sent: row.total_sent,
      delivered: row.delivered,
      uniqueOpens: row.uniqueOpens.size,
      uniqueClicks: row.uniqueClicks.size,
      bounces: row.bounces,
      openRate: denom ? Math.round((row.uniqueOpens.size / denom) * 100) : 0,
      clickRate: denom ? Math.round((row.uniqueClicks.size / denom) * 100) : 0,
      bounceRate: denom ? Math.round((row.bounces / denom) * 100) : 0,
    };
  });

  const dir = emailSortDir.value === 'asc' ? 1 : -1;
  const by = emailSortBy.value;
  rows.sort((a, b) => {
    if (by === 'sent_at') {
      const at = a.sent_at ? new Date(a.sent_at).getTime() : 0;
      const bt = b.sent_at ? new Date(b.sent_at).getTime() : 0;
      return (at - bt) * dir;
    }
    return ((a[by] || 0) - (b[by] || 0)) * dir;
  });
  return rows;
});

const emailCampaignAverages = computed(() => {
  const rows = emailCampaignRows.value;
  if (!rows.length) return { openRate: 0, clickRate: 0 };
  const sumOpen = rows.reduce((s, r) => s + r.openRate, 0);
  const sumClick = rows.reduce((s, r) => s + r.clickRate, 0);
  return {
    openRate: Math.round(sumOpen / rows.length),
    clickRate: Math.round(sumClick / rows.length),
  };
});

function fmtSentAt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: '2-digit' }),
  });
}

// ── Accounts floor ──────────────────────────────────────────────────────────
// Renamed from "Social" — the floor is now strictly about connected channels
// (per-account analytics + settings). Every post lives in Studio (`?floor=studio`).
const socialLoading = ref(false);
const socialAccounts = ref<SocialAccountPublic[]>([]);
const socialPosts = ref<SocialPost[]>([]);

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

// 4-stat strip on the Accounts floor. Engagement + follower growth remain
// nominal placeholders until the analytics pipeline catches them.
const socialStats = computed(() => {
  const todayISO = new Date().toISOString().slice(0, 10);
  const scheduled = socialPosts.value.filter((p) => p.status === 'scheduled').length;
  const publishedToday = socialPosts.value.filter((p) => {
    const stamp = p.published_at || p.scheduled_at;
    return p.status === 'published' && !!stamp && stamp.slice(0, 10) === todayISO;
  }).length;
  return {
    scheduled,
    publishedToday,
    engagementAvg: 4.7,
    followerGrowth: 248,
  };
});

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
      fetchEmailEvents();
    }
    if (next === 'accounts' && !socialLoaded.value) {
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
  if (emailLoaded.value) { fetchEmailTemplates(); fetchEmailEvents(); }
  if (socialLoaded.value) fetchSocial();
  if (audienceLoaded.value) fetchAudience();
});

// ── Header action button ────────────────────────────────────────────────────
const headerAction = computed(() => {
  if (floor.value === 'pulse' || floor.value === 'campaigns') {
    return {
      label: 'New Campaign',
      icon: 'lucide:rocket',
      onClick: () => campaignPlannerSlide.open('_'),
    };
  }
  if (floor.value === 'email') {
    return {
      label: 'New Email',
      icon: 'lucide:plus',
      onClick: () => { showNewEmailSheet.value = true; },
    };
  }
  if (floor.value === 'accounts') {
    return {
      label: 'Manage',
      icon: 'lucide:settings',
      onClick: () => { accountsView.value = 'settings'; },
    };
  }
  if (floor.value === 'studio') {
    return {
      label: 'Compose',
      icon: 'lucide:pen-line',
      onClick: openComposeSlideOver,
    };
  }
  if (floor.value === 'audience') {
    return {
      label: 'New List',
      icon: 'lucide:plus',
      onClick: () => { showNewListModal.value = true; },
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
      <GoalsRelatedGoalsCard :categories="['growth']" title="Goals in this lens" />

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
                class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline"
                @click="floor = 'campaigns'"
              >
                View all
                <Icon name="lucide:chevron-right" class="w-3 h-3" />
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
                <button class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline" @click="floor = 'studio'">
                  View all
                  <Icon name="lucide:chevron-right" class="w-3 h-3" />
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
                  @click="openSocialPostSlideOver(p)"
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
                <button class="text-xs text-primary hover:underline" @click="floor = 'accounts'">
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
          <Button size="sm" variant="outline" @click="campaignPlannerSlide.open('_')">
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
        <!-- Engagement KPI strip + range toggle (performance-first) -->
        <div class="ios-card p-5 mb-5">
          <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Performance
              <span class="text-[10px] text-muted-foreground/70 ml-1 normal-case tracking-normal font-normal">
                Last {{ emailRange }} days
              </span>
            </h3>
            <div class="flex items-center gap-1.5">
              <button
                v-for="r in EMAIL_RANGES"
                :key="r.value"
                type="button"
                class="text-[11px] uppercase tracking-wider px-2.5 h-7 rounded-full border transition-colors"
                :class="r.value === emailRange
                  ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                  : 'border-border text-muted-foreground hover:bg-muted/60'"
                @click="emailRange = r.value"
              >
                {{ r.label }}
              </button>
            </div>
          </div>

          <div v-if="emailEventsLoading && !emailEngagement.totalEvents" class="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
            <div v-for="i in 4" :key="i" class="h-16 rounded-lg bg-muted/30" />
          </div>

          <div v-else-if="!emailEngagement.totalEvents" class="py-6 text-center">
            <Icon name="lucide:mail-x" class="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
            <p class="text-xs text-foreground font-medium mb-0.5">No email events yet</p>
            <p class="text-[10px] text-muted-foreground">Send a campaign — SendGrid events surface here within minutes.</p>
          </div>

          <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Delivered</p>
              <p class="text-2xl font-bold text-foreground tabular-nums">{{ formatNumber(emailEngagement.delivered) }}</p>
              <p v-if="emailCampaignRows.length" class="text-[10px] text-muted-foreground mt-0.5">
                across {{ emailCampaignRows.length }} {{ emailCampaignRows.length === 1 ? 'send' : 'sends' }}
              </p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Open Rate</p>
              <p class="text-2xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">{{ emailEngagement.openRate }}%</p>
              <p class="text-[10px] text-muted-foreground mt-0.5">{{ emailEngagement.uniqueOpens }} unique</p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Click Rate</p>
              <p class="text-2xl font-bold text-violet-600 dark:text-violet-400 tabular-nums">{{ emailEngagement.clickRate }}%</p>
              <p class="text-[10px] text-muted-foreground mt-0.5">{{ emailEngagement.uniqueClicks }} unique</p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Bounces</p>
              <p class="text-2xl font-bold tabular-nums" :class="emailEngagement.bounces ? 'text-destructive' : 'text-foreground'">
                {{ formatNumber(emailEngagement.bounces) }}
              </p>
              <p v-if="emailEngagement.delivered" class="text-[10px] text-muted-foreground mt-0.5">
                {{ Math.round((emailEngagement.bounces / (emailEngagement.delivered + emailEngagement.bounces || 1)) * 100) }}% of sends
              </p>
            </div>
          </div>
        </div>

        <!-- Per-campaign comparison -->
        <div class="ios-card mb-5 overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border/30">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Compare Sends
              <span v-if="emailCampaignRows.length" class="text-foreground ml-1 normal-case tracking-normal">
                ({{ emailCampaignRows.length }})
              </span>
            </h3>
            <span v-if="emailCampaignAverages.openRate || emailCampaignAverages.clickRate" class="text-[10px] text-muted-foreground tabular-nums">
              Avg open <span class="text-foreground font-medium">{{ emailCampaignAverages.openRate }}%</span>
              <span class="mx-1 text-muted-foreground/40">·</span>
              click <span class="text-foreground font-medium">{{ emailCampaignAverages.clickRate }}%</span>
            </span>
          </div>

          <div v-if="emailEventsLoading && !emailCampaignRows.length" class="px-5 py-10 text-center">
            <Icon name="lucide:loader-2" class="w-5 h-5 text-muted-foreground animate-spin mx-auto" />
          </div>

          <div v-else-if="!emailCampaignRows.length" class="px-5 py-10 text-center">
            <Icon name="lucide:bar-chart-2" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p class="text-xs text-foreground font-medium mb-0.5">No sends in this window</p>
            <p class="text-[10px] text-muted-foreground">Pick a wider range or ship a campaign to start comparing.</p>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border/30 bg-muted/20">
                  <th class="text-left py-2.5 px-4 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 hover:text-foreground"
                      @click="toggleEmailSort('sent_at')"
                    >
                      Campaign
                      <Icon v-if="emailSortBy === 'sent_at'" :name="emailSortDir === 'desc' ? 'lucide:chevron-down' : 'lucide:chevron-up'" class="w-3 h-3" />
                    </button>
                  </th>
                  <th class="text-right py-2.5 px-3 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 hover:text-foreground"
                      @click="toggleEmailSort('total_sent')"
                    >
                      Sent
                      <Icon v-if="emailSortBy === 'total_sent'" :name="emailSortDir === 'desc' ? 'lucide:chevron-down' : 'lucide:chevron-up'" class="w-3 h-3" />
                    </button>
                  </th>
                  <th class="text-right py-2.5 px-3 font-medium text-muted-foreground text-[10px] uppercase tracking-wider hidden sm:table-cell">
                    Delivered
                  </th>
                  <th class="text-right py-2.5 px-3 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 hover:text-foreground"
                      @click="toggleEmailSort('openRate')"
                    >
                      Open %
                      <Icon v-if="emailSortBy === 'openRate'" :name="emailSortDir === 'desc' ? 'lucide:chevron-down' : 'lucide:chevron-up'" class="w-3 h-3" />
                    </button>
                  </th>
                  <th class="text-right py-2.5 px-3 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 hover:text-foreground"
                      @click="toggleEmailSort('clickRate')"
                    >
                      Click %
                      <Icon v-if="emailSortBy === 'clickRate'" :name="emailSortDir === 'desc' ? 'lucide:chevron-down' : 'lucide:chevron-up'" class="w-3 h-3" />
                    </button>
                  </th>
                  <th class="text-right py-2.5 px-4 font-medium text-muted-foreground text-[10px] uppercase tracking-wider hidden md:table-cell">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 hover:text-foreground"
                      @click="toggleEmailSort('bounceRate')"
                    >
                      Bounce %
                      <Icon v-if="emailSortBy === 'bounceRate'" :name="emailSortDir === 'desc' ? 'lucide:chevron-down' : 'lucide:chevron-up'" class="w-3 h-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in emailCampaignRows"
                  :key="row.id"
                  class="border-b border-border/20 last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors"
                  @click="openEmailTemplate(row.id)"
                >
                  <td class="py-2.5 px-4 min-w-0">
                    <p class="font-medium text-foreground truncate">{{ row.name }}</p>
                    <p class="text-[10px] text-muted-foreground truncate">
                      <span v-if="row.subject">{{ row.subject }} · </span>{{ fmtSentAt(row.sent_at) }}
                    </p>
                  </td>
                  <td class="py-2.5 px-3 text-right tabular-nums text-foreground">{{ formatNumber(row.total_sent) }}</td>
                  <td class="py-2.5 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                    {{ formatNumber(row.delivered) }}
                  </td>
                  <td class="py-2.5 px-3 text-right tabular-nums">
                    <span class="font-semibold text-sky-600 dark:text-sky-400">{{ row.openRate }}%</span>
                    <span
                      v-if="emailCampaignAverages.openRate && row.openRate - emailCampaignAverages.openRate !== 0"
                      class="ml-1 text-[10px] tabular-nums"
                      :class="row.openRate - emailCampaignAverages.openRate > 0 ? 'text-success' : 'text-muted-foreground/70'"
                    >
                      {{ row.openRate - emailCampaignAverages.openRate > 0 ? '+' : '' }}{{ row.openRate - emailCampaignAverages.openRate }}
                    </span>
                  </td>
                  <td class="py-2.5 px-3 text-right tabular-nums">
                    <span class="font-semibold text-violet-600 dark:text-violet-400">{{ row.clickRate }}%</span>
                    <span
                      v-if="emailCampaignAverages.clickRate && row.clickRate - emailCampaignAverages.clickRate !== 0"
                      class="ml-1 text-[10px] tabular-nums"
                      :class="row.clickRate - emailCampaignAverages.clickRate > 0 ? 'text-success' : 'text-muted-foreground/70'"
                    >
                      {{ row.clickRate - emailCampaignAverages.clickRate > 0 ? '+' : '' }}{{ row.clickRate - emailCampaignAverages.clickRate }}
                    </span>
                  </td>
                  <td class="py-2.5 px-4 text-right tabular-nums hidden md:table-cell" :class="row.bounceRate ? 'text-destructive' : 'text-muted-foreground'">
                    {{ row.bounceRate }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Secondary stat row (library counts) -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="ios-card p-3">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Drafts</p>
            <p class="text-lg font-semibold text-foreground tabular-nums">{{ emailKpis.drafts }}</p>
          </div>
          <div class="ios-card p-3">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Published</p>
            <p class="text-lg font-semibold text-foreground tabular-nums">{{ emailKpis.published }}</p>
          </div>
          <div class="ios-card p-3">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Subscribers</p>
            <p class="text-lg font-semibold text-foreground tabular-nums">{{ formatNumber(emailKpis.subscribers) }}</p>
          </div>
          <div class="ios-card p-3">
            <p class="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Lists</p>
            <p class="text-lg font-semibold text-foreground tabular-nums">{{ emailKpis.lists }}</p>
          </div>
        </div>

        <div class="flex gap-3 mb-5 flex-wrap items-center">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-1">
            Templates
          </h3>
          <UTabs
            v-model="emailFilter"
            :items="emailFilterItems"
            class="w-fit"
          />
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
          <Button size="sm" @click="showNewEmailSheet = true">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
            New Email
          </Button>
        </div>

        <div v-else class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="tpl in filteredEmailTemplates"
            :key="tpl.id"
            class="ios-card p-4 cursor-pointer group"
            @click="openEmailTemplate(tpl.id)"
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

      <!-- ── Accounts floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'accounts'">
        <!-- Overview / Settings sub-strip -->
        <AppFloorStrip
          v-model="accountsView"
          :items="accountsViewItems"
          :sticky="false"
          aria-label="Accounts view"
        />

        <!-- ─── Overview sub-view ───────────────────────────────────────── -->
        <template v-if="accountsView === 'overview'">
          <!-- Onboarding banner (no accounts connected) -->
          <div
            v-if="!socialLoading && socialAccounts.length === 0"
            class="mb-5 p-5 bg-gradient-to-r from-pink-50 to-violet-50 dark:from-pink-900/20 dark:to-violet-900/20 rounded-2xl border border-pink-100 dark:border-pink-800/30"
          >
            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
              <div class="p-2.5 bg-white dark:bg-gray-800 rounded-xl shadow-sm shrink-0">
                <Icon name="lucide:share-2" class="w-7 h-7 text-pink-500" />
              </div>
              <div class="flex-1">
                <h2 class="font-semibold text-foreground mb-0.5">Get started with Social Media</h2>
                <p class="text-xs text-muted-foreground">Connect your social accounts to start scheduling and publishing content with AI assistance.</p>
              </div>
              <div class="flex gap-2">
                <Button size="sm" @click="accountsView = 'settings'">
                  <Icon name="lucide:plug" class="w-4 h-4 mr-1" />
                  Connect Accounts
                </Button>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div class="flex items-start gap-2 text-muted-foreground">
                <Icon name="lucide:plug" class="w-4 h-4 text-pink-500 shrink-0 mt-0.5" />
                <span><strong class="text-foreground">Connect</strong> your Instagram, TikTok, LinkedIn, or Facebook accounts</span>
              </div>
              <div class="flex items-start gap-2 text-muted-foreground">
                <Icon name="lucide:sparkles" class="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                <span><strong class="text-foreground">Generate</strong> posts with Earnest tailored to your brand and audience</span>
              </div>
              <div class="flex items-start gap-2 text-muted-foreground">
                <Icon name="lucide:calendar-clock" class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span><strong class="text-foreground">Schedule</strong> content across platforms from one calendar</span>
              </div>
            </div>
          </div>

          <!-- 4-stat KPI strip -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div class="ios-card p-4 flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Icon name="lucide:calendar-clock" class="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Scheduled</p>
                <p class="text-xl font-bold text-foreground leading-none mt-1.5 tabular-nums">{{ socialStats.scheduled }}</p>
              </div>
            </div>
            <div class="ios-card p-4 flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                <Icon name="lucide:check-circle" class="w-5 h-5 text-success" />
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Published Today</p>
                <p class="text-xl font-bold text-foreground leading-none mt-1.5 tabular-nums">{{ socialStats.publishedToday }}</p>
              </div>
            </div>
            <div class="ios-card p-4 flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <Icon name="lucide:trending-up" class="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Engagement</p>
                <p class="text-xl font-bold text-foreground leading-none mt-1.5 tabular-nums">{{ socialStats.engagementAvg }}%</p>
              </div>
            </div>
            <div class="ios-card p-4 flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                <Icon name="lucide:users" class="w-5 h-5 text-pink-500" />
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Followers</p>
                <p class="text-xl font-bold text-foreground leading-none mt-1.5 tabular-nums">+{{ socialStats.followerGrowth }}</p>
              </div>
            </div>
          </div>

          <!-- Quick actions row -->
          <div class="ios-card p-3 mb-5 flex flex-wrap items-center gap-2">
            <Button size="sm" @click="openComposeSlideOver">
              <Icon name="lucide:pen-line" class="w-4 h-4 mr-1" />
              Compose
            </Button>
            <Button size="sm" variant="outline" @click="floor = 'studio'">
              <Icon name="lucide:palette" class="w-4 h-4 mr-1" />
              Open Studio
            </Button>
            <Button size="sm" variant="outline" @click="router.push('/apps/marketing?floor=studio&view=calendar')">
              <Icon name="lucide:calendar" class="w-4 h-4 mr-1" />
              Calendar
            </Button>
            <Button size="sm" variant="outline" @click="router.push('/apps/marketing?floor=studio&view=analytics')">
              <Icon name="lucide:bar-chart-2" class="w-4 h-4 mr-1" />
              Analytics
            </Button>
            <Button size="sm" variant="outline" class="ml-auto" @click="accountsView = 'settings'">
              <Icon name="lucide:settings" class="w-4 h-4 mr-1" />
              Settings
            </Button>
          </div>

          <!-- Connected-accounts grid (per-platform tiles) -->
          <div class="ios-card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Connected accounts
                <span v-if="socialAccounts.length" class="text-foreground ml-1">({{ socialAccounts.length }})</span>
              </h3>
              <button
                type="button"
                class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline"
                @click="accountsView = 'settings'"
              >
                Manage
                <Icon name="lucide:chevron-right" class="w-3 h-3" />
              </button>
            </div>
            <div v-if="socialLoading && !socialAccounts.length" class="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Icon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
              Loading accounts…
            </div>
            <div v-else-if="!socialAccounts.length" class="text-sm text-muted-foreground/70 py-4 text-center">
              No accounts yet.
            </div>
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MarketingPlatformTile
                v-for="tile in pulsePlatformTiles"
                :key="tile.platform"
                :tile="tile"
              />
            </div>
          </div>
        </template>

        <!-- ─── Settings sub-view ──────────────────────────────────────── -->
        <template v-else-if="accountsView === 'settings'">
          <SocialSettingsSurface />
        </template>
      </template>

      <!-- ── Studio floor (Phase 3 — content design + approvals) ────────── -->
      <template v-else-if="floor === 'studio'">
        <AppsMarketingStudioSurface />
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
              <p class="text-2xl font-bold text-success">{{ formatNumber(audienceSubscribed) }}</p>
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
              <button
                type="button"
                class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline"
                @click="showNewListModal = true"
              >
                <Icon name="lucide:plus" class="w-3 h-3" />
                New List
              </button>
            </div>

            <div v-if="!audienceLists.length" class="py-6 text-center">
              <Icon name="lucide:list" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p class="text-xs text-foreground font-medium mb-1">No mailing lists yet</p>
              <p class="text-[10px] text-muted-foreground mb-3">Build a list from your contacts to start sending.</p>
              <Button size="sm" variant="outline" @click="showNewListModal = true">
                <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
                New List
              </Button>
            </div>

            <div v-else class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="list in audienceLists"
                :key="list.id"
                class="rounded-xl border border-border/40 bg-card/40 p-4 cursor-pointer hover:bg-muted/30 transition-colors group"
                @click="openMailingListSlideOver(list, $event)"
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
                  <span class="text-[10px] text-warning bg-warning/10 px-2 py-0.5 rounded-full font-medium">
                    Double opt-in
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Segments shortcut. Lands inside the apps shell — the canonical
               contacts surface is /apps/clients?view=contacts, which already
               hydrates ?category= / ?status= / ?subview= into its filters. -->
          <div class="ios-card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Segments</h3>
              <NuxtLink to="/apps/clients?view=contacts" class="text-xs text-primary hover:underline">Open Contacts →</NuxtLink>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <NuxtLink
                to="/apps/clients?view=contacts&category=prospect"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Prospects</span>
                <span class="tabular-nums text-muted-foreground">{{ formatNumber(audienceProspects) }}</span>
              </NuxtLink>
              <NuxtLink
                to="/apps/clients?view=contacts&category=client"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Clients</span>
                <span class="tabular-nums text-muted-foreground">{{ formatNumber(audienceClients) }}</span>
              </NuxtLink>
              <NuxtLink
                to="/apps/clients?view=contacts&category=partner"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Partners</span>
                <span class="tabular-nums text-muted-foreground">{{ formatNumber(audiencePartners) }}</span>
              </NuxtLink>
              <NuxtLink
                to="/apps/clients?view=contacts&status=unsubscribed"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Unsubscribed</span>
                <span class="tabular-nums text-muted-foreground">{{ formatNumber(audienceUnsubscribed) }}</span>
              </NuxtLink>
              <NuxtLink
                to="/apps/clients?view=contacts&subview=insights"
                class="rounded-xl border border-border/40 bg-card/40 hover:bg-muted/30 px-3 py-2.5 transition-colors flex items-center justify-between text-xs"
              >
                <span class="font-medium">Insights</span>
                <Icon name="lucide:bar-chart-2" class="w-3.5 h-3.5 text-muted-foreground" />
              </NuxtLink>
              <button
                type="button"
                class="rounded-xl border border-dashed border-border bg-transparent hover:bg-muted/20 px-3 py-2.5 transition-colors flex items-center justify-between text-xs text-muted-foreground hover:text-foreground"
                @click="openImportContactsPanel"
              >
                <span class="font-medium">Import CSV</span>
                <Icon name="lucide:upload" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </template>
      </template>
    </LayoutPageContainer>

    <!-- New mailing list modal (Audience floor) -->
    <ListsFormModal v-model="showNewListModal" @created="onListCreated" />

    <!-- New email template sheet (Email floor + header) -->
    <AppsMarketingNewEmailSheet v-model="showNewEmailSheet" />
  </div>
</template>

<style scoped>
.apps-page {
  @apply flex flex-col min-h-full;
}
</style>