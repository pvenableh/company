<script setup lang="ts">
/**
 * Organization app — Apps Layout Phase 6.
 *
 * Single landing page with a pill-segmented floor strip:
 *   Overview (default) | Members | Billing | Integrations | Settings
 *
 * Same shape as the rest of the apps. Floor switching is in-place via
 * `?floor=` query param so the shell never remounts. This page is a
 * re-shell over `/organization/index.vue` + `/account/subscription.vue`
 * — no new data layers, no new endpoints, no new modals. Existing
 * components (`OrganizationAIUsage`, `OrganizationBillingSurface`,
 * `OrganizationInviteMemberModal`, `ClientsInviteClientModal`) are
 * reused as-is.
 *
 * Decisions documented for Phase 6:
 *   - Overview floor is read-mostly; full inline editing stays on the
 *     classic `/organization` page reachable via the Edit header action.
 *   - AI Usage lives inside the Settings floor (single chart + table —
 *     not voluminous enough to warrant its own floor).
 *   - Roles, Document Blocks, Service Templates surface as link tiles
 *     inside Settings — they're admin tooling, not daily-use.
 *   - `/account` (user profile) and `/account/subscription` stay on the
 *     avatar dropdown. The Organization app is org-scoped.
 *   - Per-floor header action button matching Money/Marketing
 *     ("Invite member" on Members, "Manage plan" on Billing, etc).
 */
import { Button } from '~/components/ui/button';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Organization | Earnest' });

const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();
const toast = useToast();

// ── Floor strip ─────────────────────────────────────────────────────────────
type FloorKey = 'overview' | 'members' | 'teams' | 'billing' | 'integrations' | 'settings';
const FLOOR_KEYS: FloorKey[] = ['overview', 'members', 'teams', 'billing', 'integrations', 'settings'];

const initialFloor: FloorKey = (() => {
  const v = route.query.floor;
  return typeof v === 'string' && FLOOR_KEYS.includes(v as FloorKey) ? (v as FloorKey) : 'overview';
})();
const floor = ref<FloorKey>(initialFloor);

watch(floor, (next) => {
  router.replace({ query: { ...route.query, floor: next === 'overview' ? undefined : next } });
});

const floors: Array<{ key: FloorKey; label: string; icon: string }> = [
  { key: 'overview', label: 'Overview', icon: 'lucide:home' },
  { key: 'members', label: 'Members', icon: 'lucide:users' },
  { key: 'teams', label: 'Teams', icon: 'lucide:users-round' },
  { key: 'billing', label: 'Billing', icon: 'lucide:credit-card' },
  { key: 'integrations', label: 'Integrations', icon: 'lucide:plug' },
  { key: 'settings', label: 'Settings', icon: 'lucide:settings' },
];

// ── Common deps ─────────────────────────────────────────────────────────────
const { selectedOrg, currentOrg, fetchOrganizationDetails } = useOrganization();
const organizationItems = useDirectusItems('organizations');
const { canAccess, isOrgOwner } = useOrgRole();
const { visibleTeams, loading: teamsLoading, fetchTeams } = useTeams();

// Lazy-load teams when the Teams floor opens so the Overview/Members floors
// don't pay the cost on first paint.
watch([floor, selectedOrg], ([f, orgId]) => {
  if (f === 'teams' && orgId) fetchTeams(orgId as string).catch(() => {});
}, { immediate: true });

const canManageOrg = computed(() => canAccess('organization_settings'));

const org = computed(() => currentOrg.value as any);
const orgName = computed(() => org.value?.name || 'Organization');

const orgLogoUrl = computed(() => {
  const o = org.value;
  if (!o) return null;
  const logoId = o.logo
    ? (typeof o.logo === 'object' ? o.logo?.id : o.logo)
    : o.icon
      ? (typeof o.icon === 'object' ? o.icon?.id : o.icon)
      : null;
  if (!logoId) return null;
  return `${config.public.directusUrl}/assets/${logoId}?key=medium-contain`;
});

// ── Members floor ───────────────────────────────────────────────────────────
const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();
const membershipItems = useDirectusItems('org_memberships');
const orgRoles = ref<any[]>([]);
const orgMemberships = ref<any[]>([]);
const showInviteMemberModal = ref(false);

async function fetchMembers() {
  if (!selectedOrg.value) return;
  try {
    await fetchFilteredUsers(selectedOrg.value);
  } catch {
    /* fetchFilteredUsers handles its own errors */
  }

  const roleItems = useDirectusItems('org_roles');
  try {
    const roles = await roleItems.list({
      filter: { organization: { _eq: selectedOrg.value } },
      fields: ['id', 'name', 'slug', 'is_system'],
      sort: ['sort', 'name'],
    });
    const order = ['owner', 'admin', 'manager', 'member', 'client'];
    orgRoles.value = (roles || []).sort((a: any, b: any) => {
      const ai = order.indexOf(a.slug);
      const bi = order.indexOf(b.slug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  } catch {
    orgRoles.value = [];
  }

  try {
    orgMemberships.value = await membershipItems.list({
      filter: { organization: { _eq: selectedOrg.value } },
      fields: ['id', 'status', 'user', 'role.id', 'role.name', 'role.slug'],
      limit: -1,
    });
  } catch {
    orgMemberships.value = [];
  }
}

const pendingInvitesCount = computed(
  () => orgMemberships.value.filter((m: any) => m.status === 'pending').length,
);

function getMemberRole(memberId: string) {
  const m = orgMemberships.value.find(
    (x: any) => (typeof x.user === 'object' ? x.user?.id : x.user) === memberId && x.status === 'active',
  );
  return m?.role || null;
}

function getRoleBadgeClasses(slug: string) {
  if (slug === 'owner') return 'bg-purple-500/15 text-purple-700 dark:text-purple-300';
  if (slug === 'admin') return 'bg-destructive/15 text-destructive dark:text-destructive';
  if (slug === 'manager') return 'bg-info/15 text-info dark:text-info';
  if (slug === 'member') return 'bg-success/15 text-success dark:text-success';
  return 'bg-muted text-muted-foreground';
}

// Client portal users (admin-routed listing)
const clientMemberships = ref<any[]>([]);
const clientMembershipsLoading = ref(false);
const showInviteClientModal = ref(false);

async function fetchClientMemberships() {
  if (!selectedOrg.value) return;
  clientMembershipsLoading.value = true;
  try {
    clientMemberships.value = (await $fetch('/api/org/list-portal-users', {
      method: 'POST',
      body: { organizationId: selectedOrg.value },
    })) as any[];
  } catch {
    clientMemberships.value = [];
  } finally {
    clientMembershipsLoading.value = false;
  }
}

function clientStatusClass(status: string) {
  if (status === 'active') return 'bg-success/15 text-success dark:text-success';
  if (status === 'pending') return 'bg-warning/15 text-warning dark:text-warning';
  return 'bg-muted text-muted-foreground';
}

function formatRelative(iso: string | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}

// ── Billing floor ───────────────────────────────────────────────────────────
const {
  loading: subscriptionLoading,
  subscriptionData,
  isActive: subscriptionActive,
  isPastDue,
  isCanceling,
  currentPlan,
  paymentMethods,
  invoices: stripeInvoices,
  periodEnd,
  fetchStatus: fetchSubscription,
  openPortal,
} = useSubscription();

const planName = computed(() => {
  if (!currentPlan.value) return 'No active plan';
  const product = (currentPlan.value as any).product;
  if (typeof product === 'object' && product?.name) return product.name;
  return 'Unknown Plan';
});

const planPrice = computed(() => {
  const p = currentPlan.value as any;
  if (!p?.amount) return null;
  return `$${(p.amount / 100).toFixed(2)}/${p.interval || 'month'}`;
});

const subscriptionStatusBadge = computed(() => {
  const status = (subscriptionData.value as any)?.subscription?.status;
  if (!status || status === 'none' || (subscriptionData.value as any)?.status === 'no_customer') {
    return { label: 'No Plan', tone: 'bg-muted text-muted-foreground' };
  }
  const map: Record<string, { label: string; tone: string }> = {
    active: { label: 'Active', tone: 'bg-success/15 text-success dark:text-success' },
    trialing: { label: 'Trial', tone: 'bg-info/15 text-info dark:text-info' },
    past_due: { label: 'Past Due', tone: 'bg-destructive/15 text-destructive dark:text-destructive' },
    canceled: { label: 'Canceled', tone: 'bg-muted text-muted-foreground' },
    incomplete: { label: 'Incomplete', tone: 'bg-warning/15 text-warning dark:text-warning' },
    unpaid: { label: 'Unpaid', tone: 'bg-destructive/15 text-destructive dark:text-destructive' },
  };
  return map[status] || { label: status, tone: 'bg-muted text-muted-foreground' };
});

function formatStripeDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatStripeMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
}

// ── Integrations floor ──────────────────────────────────────────────────────
type IntegrationStatus = 'active' | 'pending' | 'inactive' | 'restricted' | 'unknown';

const stripeConnect = ref<{
  status: IntegrationStatus;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  accountId?: string | null;
} | null>(null);

const stripeConnectLoading = ref(false);

async function fetchStripeConnect() {
  if (!selectedOrg.value) return;
  stripeConnectLoading.value = true;
  try {
    const data = await $fetch<{
      status: 'none' | 'pending' | 'active' | 'restricted';
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      accountId: string | null;
    }>('/api/stripe/connect/status', { query: { organizationId: selectedOrg.value } });

    let mapped: IntegrationStatus = 'inactive';
    if (data.status === 'active') mapped = 'active';
    else if (data.status === 'pending') mapped = 'pending';
    else if (data.status === 'restricted') mapped = 'restricted';

    stripeConnect.value = {
      status: mapped,
      chargesEnabled: data.chargesEnabled,
      payoutsEnabled: data.payoutsEnabled,
      accountId: data.accountId,
    };
  } catch (err: any) {
    if (err?.statusCode === 403) {
      stripeConnect.value = { status: 'unknown' };
    } else {
      stripeConnect.value = { status: 'inactive' };
    }
  } finally {
    stripeConnectLoading.value = false;
  }
}

const socialAccounts = ref<any[]>([]);
const socialLoading = ref(false);

async function fetchSocialAccounts() {
  socialLoading.value = true;
  try {
    const r = (await $fetch('/api/social/accounts')) as any;
    socialAccounts.value = (r?.data ?? []) as any[];
  } catch {
    socialAccounts.value = [];
  } finally {
    socialLoading.value = false;
  }
}

function socialStatusFor(platform: string): IntegrationStatus {
  const accts = socialAccounts.value.filter((a) => a.platform === platform && a.status !== 'disconnected');
  return accts.length > 0 ? 'active' : 'inactive';
}

function socialAccountCount(platform: string): number {
  return socialAccounts.value.filter((a) => a.platform === platform && a.status !== 'disconnected').length;
}

const integrationsList = computed(() => {
  const stripeMeta = stripeConnect.value;
  const stripeLabel =
    stripeMeta?.status === 'active'
      ? 'Connected · accepting payments'
      : stripeMeta?.status === 'pending'
        ? 'Onboarding in progress'
        : stripeMeta?.status === 'restricted'
          ? 'Action required'
          : stripeMeta?.status === 'unknown'
            ? 'Status unavailable'
            : 'Not connected';

  return [
    {
      key: 'stripe-connect',
      label: 'Stripe Connect',
      desc: 'Accept card and ACH payments on invoices',
      icon: 'lucide:credit-card',
      status: stripeMeta?.status || 'inactive',
      statusLabel: stripeLabel,
      action: stripeMeta?.status === 'active' ? 'Manage on Stripe' : 'Configure',
      onClick: () => {
        if (stripeMeta?.status === 'active') {
          // Standard accounts: open the full Stripe Dashboard in a new tab.
          // We can't deep-link to the merchant's account from the platform's
          // session, so we open the root and let them sign in.
          window.open('https://dashboard.stripe.com/', '_blank', 'noopener');
        } else {
          // Stay in apps layout — billing floor hosts the Configure CTA + onboarding link.
          router.push('/apps/organization?floor=billing');
        }
      },
    },
    {
      key: 'plaid',
      label: 'Plaid (Bank Sync)',
      desc: 'Auto-import transactions to expenses',
      icon: 'lucide:landmark',
      status: 'inactive' as IntegrationStatus,
      statusLabel: 'Available as add-on',
      action: 'Learn more',
      // TODO(ios-sweep): lift /account/subscription into apps shell as `/apps/account`
      onClick: () => router.push('/account/subscription'),
    },
    {
      key: 'daily',
      label: 'Daily (Video meetings)',
      desc: 'Built-in video rooms with recording + transcription',
      icon: 'lucide:video',
      status: 'active' as IntegrationStatus,
      statusLabel: 'Built-in',
      action: 'Open meetings',
      onClick: () => router.push('/apps/work?floor=meetings'),
    },
    {
      key: 'instagram',
      label: 'Instagram',
      desc: 'Publish posts and reels',
      icon: 'logos:instagram-icon',
      status: socialStatusFor('instagram'),
      statusLabel: socialStatusFor('instagram') === 'active' ? `${socialAccountCount('instagram')} account(s)` : 'Not connected',
      action: 'Manage',
      onClick: () => socialAccountsSlide.open('instagram'),
    },
    {
      key: 'facebook',
      label: 'Facebook',
      desc: 'Publish to Pages',
      icon: 'logos:facebook',
      status: socialStatusFor('facebook'),
      statusLabel: socialStatusFor('facebook') === 'active' ? `${socialAccountCount('facebook')} account(s)` : 'Not connected',
      action: 'Manage',
      onClick: () => socialAccountsSlide.open('facebook'),
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      desc: 'Publish to personal + Company Pages',
      icon: 'logos:linkedin-icon',
      status: socialStatusFor('linkedin'),
      statusLabel: socialStatusFor('linkedin') === 'active' ? `${socialAccountCount('linkedin')} account(s)` : 'Not connected',
      action: 'Manage',
      onClick: () => socialAccountsSlide.open('linkedin'),
    },
    {
      key: 'tiktok',
      label: 'TikTok',
      desc: 'Publish short-form video',
      icon: 'logos:tiktok-icon',
      status: socialStatusFor('tiktok'),
      statusLabel: socialStatusFor('tiktok') === 'active' ? `${socialAccountCount('tiktok')} account(s)` : 'Not connected',
      action: 'Manage',
      onClick: () => socialAccountsSlide.open('tiktok'),
    },
    {
      key: 'threads',
      label: 'Threads',
      desc: 'Publish text + image posts',
      icon: 'lucide:at-sign',
      status: socialStatusFor('threads'),
      statusLabel: socialStatusFor('threads') === 'active' ? `${socialAccountCount('threads')} account(s)` : 'Not connected',
      action: 'Manage',
      onClick: () => socialAccountsSlide.open('threads'),
    },
    {
      key: 'email-forwarding',
      label: 'Email forwarding (name.com)',
      desc: 'Inbound mail captures into Earnest',
      icon: 'lucide:mail',
      status: 'unknown' as IntegrationStatus,
      statusLabel: 'Configured outside Earnest',
      action: 'name.com',
      onClick: () => window.open('https://www.name.com/account/domain', '_blank', 'noopener'),
    },
  ];
});

function statusDotClass(status: IntegrationStatus) {
  if (status === 'active') return 'bg-success';
  if (status === 'pending') return 'bg-warning';
  if (status === 'restricted') return 'bg-destructive';
  if (status === 'unknown') return 'bg-muted-foreground/40';
  return 'bg-muted-foreground/30';
}

// ── Settings floor — admin tooling tiles ─────────────────────────────────────
// Tiles either link out (`to`) or open a slide-over panel (`onClick`).
// Teams / Roles / Documents Library all live as slide-overs registered in
// `panels/registry.ts`; tiles fire `useAppSlideOver(type).open(id)` so the
// underlying Settings page stays in place behind the panel.
const teamsSlide = useAppSlideOver('teams');
const rolesSlide = useAppSlideOver('roles');
const documentsLibrarySlide = useAppSlideOver('documents_library');
const socialAccountsSlide = useAppSlideOver('social-accounts');
const settingsTiles = [
  { label: 'Teams', desc: 'Group members for permissions and assignment', icon: 'lucide:user-cog', onClick: () => teamsSlide.open('_') },
  { label: 'Roles & permissions', desc: 'Custom roles and feature access matrix', icon: 'lucide:shield-check', onClick: () => rolesSlide.open('_') },
  { label: 'Documents library', desc: 'Reusable blocks + service offerings the proposal builder draws from', icon: 'lucide:blocks', onClick: () => documentsLibrarySlide.open('blocks') },
];

// Document theme — applied to invoices, proposals, contracts. Inline editor in
// the Settings floor; mirrors the classic /organization page so the user never
// has to leave /apps/* to change it.
const DOC_THEMES = [
  { value: 'classic', label: 'Classic', desc: 'Clean white card, sans-serif. The default.' },
  { value: 'editorial', label: 'Editorial', desc: 'Warm cream paper, serif body. Traditional document feel.' },
  { value: 'mono', label: 'Mono', desc: 'Minimal black-on-white with your accent color.' },
] as const;

const savingDocTheme = ref(false);
const localAccent = ref('#1f2937');
watch(() => (org.value as any)?.document_accent, (v) => { if (v) localAccent.value = v as string; }, { immediate: true });

async function saveDocumentTheme(theme: string) {
  if (!org.value?.id || savingDocTheme.value) return;
  savingDocTheme.value = true;
  try {
    await organizationItems.update(org.value.id, { document_theme: theme });
    toast.add({ title: 'Document theme updated', description: 'Applied to invoices, proposals, and contracts.', color: 'green' });
    await fetchOrganizationDetails();
  } catch (error: any) {
    toast.add({ title: 'Error', description: error?.data?.message || error?.message || 'Failed to update theme', color: 'red' });
  } finally {
    savingDocTheme.value = false;
  }
}

async function saveDocumentAccent() {
  if (!org.value?.id || savingDocTheme.value) return;
  savingDocTheme.value = true;
  try {
    await organizationItems.update(org.value.id, { document_accent: localAccent.value });
    toast.add({ title: 'Accent color updated', color: 'green' });
    await fetchOrganizationDetails();
  } catch (error: any) {
    toast.add({ title: 'Error', description: error?.data?.message || error?.message || 'Failed to update accent', color: 'red' });
  } finally {
    savingDocTheme.value = false;
  }
}

const isArchived = computed(() => !!org.value?.archived_at);

// ── Lazy-load per floor ─────────────────────────────────────────────────────
const overviewLoaded = ref(false);
const membersLoaded = ref(false);
const billingLoaded = ref(false);
const integrationsLoaded = ref(false);
const settingsLoaded = ref(false);

watch(
  floor,
  (next) => {
    if (!selectedOrg.value) return;
    if (next === 'overview' && !overviewLoaded.value) {
      overviewLoaded.value = true;
      // Overview pulls everything visible from currentOrg + a member count.
      fetchMembers();
    }
    if (next === 'members' && !membersLoaded.value) {
      membersLoaded.value = true;
      fetchMembers();
      fetchClientMemberships();
    }
    if (next === 'billing' && !billingLoaded.value) {
      billingLoaded.value = true;
      fetchSubscription();
    }
    if (next === 'integrations' && !integrationsLoaded.value) {
      integrationsLoaded.value = true;
      fetchStripeConnect();
      fetchSocialAccounts();
    }
    if (next === 'settings' && !settingsLoaded.value) {
      settingsLoaded.value = true;
      // Nothing extra to fetch — AI Usage component self-loads.
    }
  },
  { immediate: true },
);

// Refetch on org change for any floor already loaded.
watch(selectedOrg, () => {
  if (overviewLoaded.value) fetchMembers();
  if (membersLoaded.value) {
    fetchMembers();
    fetchClientMemberships();
  }
  if (billingLoaded.value) fetchSubscription();
  if (integrationsLoaded.value) {
    fetchStripeConnect();
    fetchSocialAccounts();
  }
});

// ── Header action ───────────────────────────────────────────────────────────
const headerAction = computed(() => {
  if (floor.value === 'overview' && canManageOrg.value) {
    return {
      label: 'Edit',
      icon: 'lucide:pencil',
      // TODO(ios-sweep): lift to OrganizationEditPanel slide-over
      onClick: () => router.push('/organization'),
    };
  }
  if (floor.value === 'members' && canManageOrg.value) {
    return {
      label: 'Invite member',
      icon: 'lucide:mail',
      onClick: () => {
        showInviteMemberModal.value = true;
      },
    };
  }
  if (floor.value === 'billing' && (subscriptionActive.value || isPastDue.value)) {
    return {
      label: 'Manage plan',
      icon: 'lucide:external-link',
      onClick: async () => {
        try {
          await openPortal();
        } catch {
          toast.add({ title: 'Error', description: 'Could not open Stripe portal', color: 'red' });
        }
      },
    };
  }
  return null;
});

function onMemberInvited() {
  showInviteMemberModal.value = false;
  fetchMembers();
}

function onClientInvited() {
  showInviteClientModal.value = false;
  fetchClientMemberships();
}
</script>

<template>
  <div class="apps-page">
    <AppHeader :title="orgName" app-id="organization">
      <template #actions>
        <Button v-if="headerAction" size="sm" @click="headerAction.onClick">
          <Icon :name="headerAction.icon" class="w-4 h-4 mr-1" />
          {{ headerAction.label }}
        </Button>
      </template>
    </AppHeader>

    <LayoutPageContainer>
      <AppFloorStrip v-model="floor" :items="floors" aria-label="Organization sections" />

      <AppIntroCard app-id="organization" />

      <!-- Archived banner -->
      <div
        v-if="isArchived"
        class="mb-5 rounded-xl border border-warning/30 bg-warning/10 dark:bg-warning/20 p-4 flex items-start gap-3"
      >
        <Icon name="lucide:archive" class="w-5 h-5 text-warning mt-0.5" />
        <div class="flex-1 text-sm">
          <p class="font-medium text-warning">This organization is archived</p>
          <p class="text-xs text-warning dark:text-warning mt-0.5">
            Restore it from the classic settings page to reactivate access.
          </p>
        </div>
        <!-- TODO(ios-sweep): lift archive-restore into an inline action; for now keep the legacy /organization redirect since this banner only renders for archived orgs (rare path) -->
        <Button size="sm" variant="outline" @click="router.push('/organization')">
          Open settings
        </Button>
      </div>

      <!-- ── Overview floor ───────────────────────────────────────────── -->
      <template v-if="floor === 'overview'">
        <div v-if="!org" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading organization…</p>
        </div>
        <template v-else>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <!-- Left: brand + identity -->
            <div class="lg:col-span-2 space-y-5">
              <div class="ios-card p-5">
                <div class="flex items-center gap-4">
                  <div
                    v-if="orgLogoUrl"
                    class="w-16 h-16 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0"
                  >
                    <img :src="orgLogoUrl" :alt="orgName" class="w-full h-full object-contain" />
                  </div>
                  <div
                    v-else
                    class="w-16 h-16 rounded-xl bg-muted flex items-center justify-center shrink-0"
                    :style="org.brand_color ? { backgroundColor: org.brand_color } : {}"
                  >
                    <Icon name="lucide:building-2" class="w-7 h-7 text-muted-foreground" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <h2 class="text-xl font-semibold truncate">{{ org.name }}</h2>
                    <p v-if="org.industry?.name" class="text-xs text-muted-foreground mt-0.5">
                      {{ org.industry.name }}<span v-if="org.industry.class"> · {{ org.industry.class }}</span>
                    </p>
                    <a
                      v-if="org.website"
                      :href="org.website.startsWith('http') ? org.website : 'https://' + org.website"
                      target="_blank"
                      class="text-xs text-primary hover:underline mt-0.5 inline-block"
                    >
                      {{ org.website.replace(/^https?:\/\//, '') }}
                    </a>
                  </div>
                </div>
              </div>

              <div class="ios-card p-5 space-y-4">
                <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Brand & Strategy</h3>
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Brand Direction</p>
                  <p v-if="org.brand_direction" class="text-sm whitespace-pre-line">{{ org.brand_direction }}</p>
                  <p v-else class="text-sm text-muted-foreground italic">Not set</p>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Goals</p>
                  <p v-if="org.goals" class="text-sm whitespace-pre-line">{{ org.goals }}</p>
                  <p v-else class="text-sm text-muted-foreground italic">Not set</p>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Target Audience</p>
                  <p v-if="org.target_audience" class="text-sm">{{ org.target_audience }}</p>
                  <p v-else class="text-sm text-muted-foreground italic">Not set</p>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Location</p>
                  <p v-if="org.location" class="text-sm">{{ org.location }}</p>
                  <p v-else class="text-sm text-muted-foreground italic">Not set</p>
                </div>
              </div>
            </div>

            <!-- Right: snapshot stats -->
            <div class="space-y-4">
              <div class="ios-card p-5 space-y-3 text-sm">
                <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Snapshot</h3>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground text-xs">Members</span>
                  <button
                    type="button"
                    class="text-sm font-medium hover:text-primary"
                    @click="floor = 'members'"
                  >
                    {{ filteredUsers.length }}
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground text-xs">Pending invites</span>
                  <span class="text-sm font-medium">{{ pendingInvitesCount }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground text-xs">Plan</span>
                  <span class="text-sm font-medium capitalize">{{ org.plan || '—' }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground text-xs">Member since</span>
                  <span class="text-sm font-medium">
                    {{ org.origin_date ? new Date(org.origin_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '—' }}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground text-xs">Status</span>
                  <span
                    class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium"
                    :class="org.active !== false ? 'bg-success/15 text-success dark:text-success' : 'bg-muted text-muted-foreground'"
                  >
                    {{ org.active !== false ? 'Active' : 'Inactive' }}
                  </span>
                </div>
              </div>

              <div class="ios-card p-5 space-y-3 text-sm">
                <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Contact</h3>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground text-xs">Email</span>
                  <a v-if="org.email" :href="'mailto:' + org.email" class="text-sm text-primary truncate max-w-[160px]">{{ org.email }}</a>
                  <span v-else class="text-muted-foreground italic text-xs">—</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground text-xs">Phone</span>
                  <a v-if="org.phone" :href="'tel:' + org.phone" class="text-sm text-primary">{{ org.phone }}</a>
                  <span v-else class="text-muted-foreground italic text-xs">—</span>
                </div>
                <div v-if="org.address" class="text-xs text-muted-foreground whitespace-pre-line pt-1 border-t border-border/40">
                  {{ org.address }}
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- ── Members floor ────────────────────────────────────────────── -->
      <template v-else-if="floor === 'members'">
        <div class="space-y-6">
          <!-- Members section -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">Organization Members</h3>
              <span class="text-xs text-muted-foreground">{{ filteredUsers.length }} member{{ filteredUsers.length === 1 ? '' : 's' }}</span>
            </div>

            <div
              v-if="pendingInvitesCount > 0"
              class="mb-3 rounded-xl bg-warning/10 dark:bg-warning/20 px-4 py-2.5 text-sm text-warning dark:text-warning flex items-center gap-2"
            >
              <Icon name="lucide:clock" class="w-4 h-4" />
              {{ pendingInvitesCount }} pending invitation{{ pendingInvitesCount === 1 ? '' : 's' }}
            </div>

            <div v-if="!filteredUsers.length" class="ios-card p-12 text-center">
              <Icon name="lucide:users" class="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p class="text-sm text-muted-foreground">No members yet.</p>
            </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="member in filteredUsers"
                :key="member.id"
                class="ios-card p-4 flex items-center gap-3"
              >
                <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    v-if="member.avatar"
                    :src="`${config.public.directusUrl}/assets/${member.avatar}?key=small`"
                    :alt="`${member.first_name} ${member.last_name}`"
                    class="w-full h-full object-cover"
                  />
                  <span v-else class="text-sm font-medium text-muted-foreground">
                    {{ (member.first_name?.[0] || '') + (member.last_name?.[0] || '') }}
                  </span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ member.first_name }} {{ member.last_name }}</p>
                  <p class="text-xs text-muted-foreground truncate">{{ member.email }}</p>
                </div>
                <span
                  v-if="getMemberRole(member.id)"
                  class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium shrink-0"
                  :class="getRoleBadgeClasses(getMemberRole(member.id).slug)"
                >
                  {{ getMemberRole(member.id).name }}
                </span>
              </div>
            </div>
          </div>

          <!-- Client portal access section -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <div>
                <h3 class="text-sm font-semibold">Client Portal Access</h3>
                <p class="text-xs text-muted-foreground mt-0.5">
                  All client users with login access across your client companies.
                </p>
              </div>
              <Button
                v-if="canManageOrg"
                size="sm"
                variant="outline"
                @click="showInviteClientModal = true"
              >
                <Icon name="lucide:user-plus" class="w-4 h-4 mr-1" />
                Invite client
              </Button>
            </div>

            <div v-if="clientMembershipsLoading" class="flex justify-center py-12">
              <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
            <div v-else-if="!clientMemberships.length" class="ios-card p-10 text-center">
              <Icon name="lucide:key" class="w-9 h-9 text-muted-foreground/40 mx-auto mb-3" />
              <p class="text-sm text-muted-foreground">No client portal users yet.</p>
            </div>

            <div v-else class="ios-card overflow-hidden">
              <div
                v-for="m in clientMemberships"
                :key="m.id"
                class="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-center px-4 py-3 border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium truncate">
                    {{ ((m.user?.first_name || '') + ' ' + (m.user?.last_name || '')).trim() || m.user?.email || 'Unknown' }}
                  </p>
                  <p class="text-xs text-muted-foreground truncate">{{ m.user?.email }}</p>
                  <p v-if="m.client?.name" class="sm:hidden text-[11px] text-muted-foreground/70 truncate mt-0.5">
                    {{ m.client.name }}
                  </p>
                </div>
                <div class="hidden sm:block min-w-0">
                  <NuxtLink
                    v-if="m.client?.id"
                    :to="`/clients/${m.client.id}`"
                    class="text-sm text-primary hover:underline truncate block"
                  >
                    {{ m.client.name }}
                  </NuxtLink>
                  <span v-else class="text-xs text-muted-foreground italic">Unscoped</span>
                </div>
                <span
                  class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium capitalize justify-self-start"
                  :class="clientStatusClass(m.status)"
                >
                  {{ m.status }}
                </span>
                <div class="text-right text-xs text-muted-foreground whitespace-nowrap">
                  <span v-if="m.user?.last_access" :title="new Date(m.user.last_access).toLocaleString()">
                    {{ formatRelative(m.user.last_access) }}
                  </span>
                  <span v-else-if="m.invited_at" class="text-[10px] italic">
                    Invited {{ formatRelative(m.invited_at) }}
                  </span>
                  <span v-else>—</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Teams floor ──────────────────────────────────────────────── -->
      <template v-else-if="floor === 'teams'">
        <div class="space-y-4 max-w-5xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-base font-semibold text-foreground">Teams</h2>
              <p class="text-xs text-muted-foreground mt-0.5">
                Group members into teams so Work + Calendar views can scope by team.
                Each team has its own roster of members and shared client visibility.
              </p>
            </div>
            <Button size="sm" variant="outline" @click="teamsSlide.open('_')">
              <Icon name="lucide:settings" class="w-4 h-4 mr-1" />
              Manage teams
            </Button>
          </div>

          <div v-if="teamsLoading" class="ios-card p-8 text-center">
            <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          </div>
          <div v-else-if="!visibleTeams.length" class="ios-card p-8 text-center">
            <Icon name="lucide:users-round" class="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p class="text-sm font-medium">No teams yet</p>
            <p class="text-xs text-muted-foreground mt-1 mb-3">
              Group members so the Work app and calendar can be filtered by team.
            </p>
            <Button size="sm" @click="teamsSlide.open('_')">
              <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
              Create team
            </Button>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <NuxtLink
              v-for="t in visibleTeams"
              :key="t.id"
              :to="`/teams/${t.id}`"
              class="ios-card p-4 hover:bg-muted/30 transition-colors"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-foreground truncate">{{ t.name }}</p>
                  <p v-if="t.description" class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ t.description }}</p>
                </div>
                <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </div>
              <div class="mt-3 text-[11px] text-muted-foreground">
                {{ (t.users?.length || 0) }} {{ (t.users?.length || 0) === 1 ? 'member' : 'members' }}
              </div>
            </NuxtLink>
          </div>
        </div>
      </template>

      <!-- ── Billing floor ────────────────────────────────────────────── -->
      <template v-else-if="floor === 'billing'">
        <div v-if="subscriptionLoading && !subscriptionData" class="space-y-3">
          <div v-for="i in 3" :key="i" class="ios-card p-6 animate-pulse">
            <div class="h-4 bg-muted rounded w-1/3 mb-3" />
            <div class="h-3 bg-muted rounded w-2/3" />
          </div>
        </div>

        <template v-else>
          <!-- Past Due alert -->
          <div
            v-if="isPastDue"
            class="rounded-xl border-2 border-destructive/30 bg-destructive/10 dark:bg-destructive/20 p-4 mb-5 flex items-start gap-3"
          >
            <Icon name="lucide:alert-triangle" class="w-5 h-5 text-destructive mt-0.5" />
            <div class="flex-1">
              <p class="font-semibold text-destructive dark:text-destructive text-sm">Payment Past Due</p>
              <p class="text-xs text-destructive dark:text-destructive mt-1">
                Your last payment failed. Update your payment method to keep your subscription active.
              </p>
              <Button size="sm" variant="destructive" class="mt-3" @click="openPortal">
                Update payment method
              </Button>
            </div>
          </div>

          <!-- Canceling notice -->
          <div
            v-if="isCanceling"
            class="rounded-xl border-2 border-warning/30 bg-warning/10 dark:bg-warning/20 p-4 mb-5 flex items-start gap-3"
          >
            <Icon name="lucide:clock" class="w-5 h-5 text-warning mt-0.5" />
            <div class="flex-1">
              <p class="font-semibold text-warning dark:text-warning text-sm">Subscription Canceling</p>
              <p class="text-xs text-warning dark:text-warning mt-1">
                Ends on
                <strong>{{ periodEnd ? periodEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—' }}</strong>.
                You'll retain access until then.
              </p>
            </div>
          </div>

          <!-- Current Plan card -->
          <div class="ios-card p-5 mb-5">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <EarnestIcon class="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p class="font-semibold text-foreground">{{ planName }}</p>
                  <p class="text-xs text-muted-foreground">
                    <template v-if="planPrice">{{ planPrice }}</template>
                    <template v-else>Your current plan</template>
                  </p>
                </div>
              </div>
              <span
                class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium"
                :class="subscriptionStatusBadge.tone"
              >
                {{ subscriptionStatusBadge.label }}
              </span>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p class="text-muted-foreground text-xs">Plan</p>
                <p class="font-medium">{{ planName }}</p>
              </div>
              <div>
                <p class="text-muted-foreground text-xs">Price</p>
                <p class="font-medium">{{ planPrice || '—' }}</p>
              </div>
              <div>
                <p class="text-muted-foreground text-xs">Status</p>
                <p class="font-medium capitalize">{{ (subscriptionData as any)?.subscription?.status || '—' }}</p>
              </div>
              <div>
                <p class="text-muted-foreground text-xs">Next billing</p>
                <p class="font-medium">{{ periodEnd ? periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }}</p>
              </div>
            </div>
          </div>

          <!-- Stripe Connect billing surface (native) — when KYC active -->
          <OrganizationBillingSurface
            v-if="stripeConnect?.status === 'active' && org?.id"
            :organization-id="org.id"
            class="mb-5"
          />

          <!-- Payment methods -->
          <div class="ios-card p-5 mb-5">
            <h3 class="text-sm font-semibold mb-4 flex items-center gap-2">
              <Icon name="lucide:credit-card" class="w-4 h-4" />
              Payment Methods
            </h3>
            <div v-if="paymentMethods.length === 0" class="flex items-center justify-between">
              <p class="text-sm text-muted-foreground">No payment method on file</p>
              <Button size="sm" variant="outline" :disabled="subscriptionLoading" @click="openPortal">
                Add payment method
              </Button>
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="pm in paymentMethods"
                :key="pm.id"
                class="flex items-center justify-between"
              >
                <div class="flex items-center gap-3">
                  <Icon name="lucide:credit-card" class="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p class="text-sm font-medium capitalize">{{ pm.brand }} •••• {{ pm.last4 }}</p>
                    <p class="text-xs text-muted-foreground">Expires {{ pm.exp_month }}/{{ pm.exp_year }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Billing history -->
          <div class="ios-card p-5">
            <h3 class="text-sm font-semibold mb-4 flex items-center gap-2">
              <Icon name="lucide:file-text" class="w-4 h-4" />
              Billing History
            </h3>
            <div v-if="stripeInvoices.length === 0" class="text-center py-6">
              <Icon name="lucide:file-text" class="w-9 h-9 mx-auto mb-3 text-muted-foreground/30" />
              <p class="text-sm text-muted-foreground">No billing history yet</p>
            </div>
            <div v-else class="divide-y divide-border/40">
              <div
                v-for="inv in stripeInvoices"
                :key="inv.id"
                class="flex items-center justify-between py-3"
              >
                <div class="flex items-center gap-3">
                  <Icon name="lucide:file-text" class="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p class="text-sm font-medium">{{ inv.number || 'Invoice' }}</p>
                    <p class="text-xs text-muted-foreground">{{ formatStripeDate(inv.created) }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium tabular-nums">{{ formatStripeMoney(inv.amount_paid || inv.amount_due) }}</span>
                  <span
                    class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium"
                    :class="inv.status === 'paid'
                      ? 'bg-success/15 text-success'
                      : inv.status === 'open'
                        ? 'bg-warning/15 text-warning'
                        : 'bg-muted text-muted-foreground'"
                  >
                    {{ inv.status }}
                  </span>
                  <a
                    v-if="inv.hosted_invoice_url"
                    :href="inv.hosted_invoice_url"
                    target="_blank"
                    class="text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="lucide:external-link" class="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- ── Integrations floor ───────────────────────────────────────── -->
      <template v-else-if="floor === 'integrations'">
        <div v-if="stripeConnectLoading && !stripeConnect" class="flex items-center justify-center py-16 gap-3">
          <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-muted-foreground" />
          <span class="text-sm text-muted-foreground">Loading integrations…</span>
        </div>

        <div v-else class="ios-card overflow-hidden">
          <div
            v-for="(item, idx) in integrationsList"
            :key="item.key"
            class="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors"
            :class="idx > 0 ? 'border-t border-border/30' : ''"
          >
            <div class="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Icon :name="item.icon" class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium">{{ item.label }}</p>
              <p class="text-xs text-muted-foreground truncate">{{ item.desc }}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span :class="['w-1.5 h-1.5 rounded-full', statusDotClass(item.status)]" />
                {{ item.statusLabel }}
              </span>
              <Button size="sm" variant="ghost" @click="item.onClick">
                {{ item.action }}
                <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </template>

      <!-- ── Settings floor ───────────────────────────────────────────── -->
      <template v-else-if="floor === 'settings'">
        <div class="space-y-5">
          <!-- Admin tooling tiles -->
          <div>
            <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">
              Admin tooling
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <component
                :is="tile.to ? 'NuxtLink' : 'button'"
                v-for="tile in settingsTiles"
                :key="tile.label"
                :to="tile.to"
                :type="tile.to ? undefined : 'button'"
                class="ios-card p-4 flex items-start gap-3 hover:border-primary/40 transition-colors group text-left w-full"
                @click="tile.onClick?.()"
              >
                <div class="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Icon :name="tile.icon" class="w-5 h-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium group-hover:text-primary">{{ tile.label }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ tile.desc }}</p>
                </div>
                <Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/50 shrink-0 mt-1" />
              </component>
            </div>
          </div>

          <!-- Document theme — applied to every invoice, proposal, and
               contract. Inlined here so users never have to leave the apps
               shell to swap themes or accent color. -->
          <div v-if="canManageOrg && org" class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Document theme
            </h3>
            <p class="text-xs text-muted-foreground mb-3">
              Sets the look of every invoice, proposal, and contract you send.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                v-for="t in DOC_THEMES"
                :key="t.value"
                type="button"
                class="text-left rounded-lg border p-3 transition-all"
                :class="(org.document_theme || 'classic') === t.value
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                  : 'border-border hover:border-primary/40 hover:bg-muted/40'"
                :disabled="savingDocTheme"
                @click="saveDocumentTheme(t.value)"
              >
                <div
                  class="mb-2 h-12 rounded border doc-shell"
                  :class="`doc-theme--${t.value}`"
                  :style="t.value === 'mono' ? { '--doc-accent-color': localAccent } : {}"
                >
                  <div class="h-full flex items-center px-2 gap-1.5">
                    <div class="w-3 h-3 rounded-sm" :style="`background: var(--doc-accent)`" />
                    <div class="flex-1 h-1.5 rounded-full" :style="`background: var(--doc-rule)`" />
                  </div>
                </div>
                <p class="font-medium text-xs">{{ t.label }}</p>
                <p class="text-[10px] text-muted-foreground leading-snug mt-0.5">{{ t.desc }}</p>
              </button>
            </div>
            <div
              v-if="(org.document_theme || 'classic') === 'mono'"
              class="flex items-center gap-2 pt-3 mt-3 border-t border-border"
            >
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Brand accent</label>
              <input
                v-model="localAccent"
                type="color"
                class="h-7 w-10 rounded cursor-pointer border border-border"
              />
              <input
                v-model="localAccent"
                type="text"
                class="h-7 px-2 text-xs rounded border border-border bg-background w-24 font-mono"
                placeholder="#1f2937"
              />
              <Button
                size="sm"
                :disabled="savingDocTheme || localAccent === org.document_accent"
                @click="saveDocumentAccent"
              >
                Apply
              </Button>
            </div>
          </div>

          <!-- AI Usage -->
          <div class="ios-card p-5">
            <OrganizationAIUsage v-if="selectedOrg" :organization-id="selectedOrg" />
          </div>

          <!-- Danger zone -->
          <div v-if="isOrgOwner" class="ios-card p-5 border border-destructive/30 dark:border-destructive/50">
            <h3 class="text-[10px] uppercase tracking-wider font-semibold text-destructive dark:text-destructive mb-2">
              Danger zone
            </h3>
            <p v-if="!isArchived" class="text-sm text-muted-foreground mb-3">
              Archive this organization to cancel your subscription at the end of the current billing period and soft-delete all data. Retained for 90 days.
            </p>
            <p v-else class="text-sm text-muted-foreground mb-3">
              This organization is archived. Restore it from the classic settings page.
            </p>
            <!-- TODO(ios-sweep): lift archive flow to a destructive confirm bottom sheet -->
            <Button size="sm" variant="outline" class="text-destructive border-destructive/30" @click="router.push('/organization?tab=overview')">
              <Icon name="lucide:archive" class="w-4 h-4 mr-1" />
              {{ isArchived ? 'Manage archive' : 'Archive organization' }}
            </Button>
          </div>
        </div>
      </template>
    </LayoutPageContainer>

    <!-- Modals — reused from the classic page -->
    <OrganizationInviteMemberModal
      v-if="selectedOrg"
      v-model="showInviteMemberModal"
      :organization-id="selectedOrg"
      :roles="orgRoles"
      @invited="onMemberInvited"
    />

    <ClientsInviteClientModal
      v-if="selectedOrg"
      v-model="showInviteClientModal"
      :organization-id="selectedOrg"
      @invited="onClientInvited"
    />
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.apps-page {
  @apply flex flex-col h-full;
}
</style>
