<script setup lang="ts">
/**
 * Organization app — Apps Layout Phase 6.
 *
 * Single landing page with a pill-segmented floor strip:
 *   Overview (default) | Members | Billing | Integrations | Settings
 *
 * Same shape as the rest of the apps. Floor switching is in-place via
 * `?floor=` query param so the shell never remounts. This page is a
 * re-shell over `/organization/index.vue`. The Billing floor delegates
 * entirely to `<AppsAccountSubscriptionSurface>` (plan · add-ons · payment
 * methods · billing history · cancel). Stripe Connect (getting paid by
 * clients) moved to the Money app's Payouts floor; the Integrations tile is
 * now a status + deep-link. Existing components (`OrganizationAIUsage`,
 * `OrganizationInviteMemberModal`, `ClientsInviteClientModal`) are reused as-is.
 *
 * Decisions documented for Phase 6:
 *   - Overview floor is read-mostly; full inline editing stays on the
 *     classic `/organization` page reachable via the Edit header action.
 *   - AI Usage + token management get their own "AI & Tokens" floor —
 *     usage meter, per-member breakdown, purchase, and org/member limits
 *     are a first-class org concern, not buried under Settings.
 *   - Roles, Document Blocks, Service Templates surface as link tiles
 *     inside Settings — they're admin tooling, not daily-use.
 *   - `/account` (user profile) stays on the avatar dropdown; subscription &
 *     billing now lives here on the Billing floor (org-scoped concern).
 *   - Per-floor header action button matching Money/Marketing
 *     ("Invite member" on Members, etc). Billing has none — the shared
 *     surface owns its own actions.
 */
import { Button } from '~/components/ui/button';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Organization | Earnest' });

const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();
const toast = useToast();

// ── Floor strip ─────────────────────────────────────────────────────────────
type FloorKey = 'overview' | 'members' | 'teams' | 'billing' | 'ai' | 'communications' | 'integrations' | 'settings';
const FLOOR_KEYS: FloorKey[] = ['overview', 'members', 'teams', 'billing', 'ai', 'communications', 'integrations', 'settings'];

const initialFloor: FloorKey = (() => {
  const v = route.query.floor;
  return typeof v === 'string' && FLOOR_KEYS.includes(v as FloorKey) ? (v as FloorKey) : 'overview';
})();
const floor = ref<FloorKey>(initialFloor);

// Interior floor content slides left/right to match the main app transition.
const floorTransition = useDirectionalFloorTransition(FLOOR_KEYS, floor);

watch(floor, (next) => {
  router.replace({ query: { ...route.query, floor: next === 'overview' ? undefined : next } });
});

// Floor list lifted into the shared nav model (`useAppNav`) so this strip and
// the desktop AppSidebar never drift.
const floors = appFloors('organization') as Array<{ key: FloorKey; label: string; icon: string }>;

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

const canManageOrg = computed(() => canAccess('org_settings'));

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

// ── Member & client management (owner/admin) ─────────────────────────────────
// Ported from the classic /organization page so role changes, member removal,
// adding existing users, and client-portal lifecycle actions have a home in the
// modern shell — a prerequisite for retiring the classic page.
const { user: sessionUser, loggedIn } = useUserSession();
const currentUserId = computed(() => (loggedIn.value ? (sessionUser.value as any)?.id ?? null : null));
const orgUserJunction = useDirectusItems('organizations_directus_users');
const { readUsers } = useDirectusUsers();

// Owner role is never reassignable.
const assignableRoles = computed(() => orgRoles.value.filter((r: any) => r.slug !== 'owner'));

// Change member role
const changingRole = ref(false);
async function changeMemberRole(memberId: string, newRoleId: string) {
  if (!selectedOrg.value || changingRole.value) return;
  const membership = orgMemberships.value.find(
    (m: any) => (typeof m.user === 'object' ? m.user?.id : m.user) === memberId && m.status === 'active',
  );
  if (!membership) {
    toast.add({ title: 'Error', description: 'Could not find membership for this user', color: 'red' });
    return;
  }
  const currentRole = membership.role;
  if (currentRole && typeof currentRole === 'object' && currentRole.slug === 'owner') {
    toast.add({ title: 'Error', description: 'Cannot change the owner role', color: 'red' });
    return;
  }
  changingRole.value = true;
  try {
    await membershipItems.update(membership.id, { role: newRoleId });
    toast.add({ title: 'Saved', description: 'Member role updated', color: 'green' });
    await fetchMembers();
  } catch (error: any) {
    toast.add({ title: 'Error', description: error?.data?.message || error?.message || 'Failed to update role', color: 'red' });
  } finally {
    changingRole.value = false;
  }
}

// Add existing user
const showAddMemberModal = ref(false);
const searchEmail = ref('');
const searchResults = ref<any[]>([]);
const searching = ref(false);
const addingUser = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function openAddMemberModal() {
  searchEmail.value = '';
  searchResults.value = [];
  showAddMemberModal.value = true;
}

async function searchUsers() {
  if (!searchEmail.value || searchEmail.value.length < 2) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    const users = await readUsers({
      filter: {
        _or: [
          { email: { _contains: searchEmail.value } },
          { first_name: { _contains: searchEmail.value } },
          { last_name: { _contains: searchEmail.value } },
        ],
      },
      fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
      limit: 10,
    });
    // Exclude users already in the org.
    const existingIds = new Set(filteredUsers.value.map((u: any) => u.id));
    searchResults.value = (users || []).filter((u: any) => !existingIds.has(u.id));
  } catch (error) {
    console.error('Error searching users:', error);
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
}

watch(searchEmail, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchUsers(), 300);
});

async function addUserToOrganization(userId: string) {
  if (!selectedOrg.value || !userId) return;
  addingUser.value = true;
  try {
    // Route through the server endpoint so an org_membership row (which carries
    // the role) is created alongside the legacy junction — a raw junction insert
    // leaves the user with no org role and therefore no permissions.
    await $fetch('/api/org/add-member', {
      method: 'POST',
      body: { organizationId: selectedOrg.value, userId },
    });
    toast.add({ title: 'Added', description: 'User added to organization', color: 'green' });
    await fetchMembers();
    searchResults.value = searchResults.value.filter((u: any) => u.id !== userId);
  } catch (error) {
    console.error('Error adding user to organization:', error);
    toast.add({ title: 'Error', description: 'Failed to add user to organization', color: 'red' });
  } finally {
    addingUser.value = false;
  }
}

// Remove member
const showRemoveMemberModal = ref(false);
const memberToRemove = ref<any>(null);
const removingMember = ref(false);

function confirmRemoveMember(member: any) {
  memberToRemove.value = member;
  showRemoveMemberModal.value = true;
}

async function removeMember() {
  if (!memberToRemove.value || !selectedOrg.value) return;
  removingMember.value = true;
  try {
    // Remove from the legacy junction, then suspend the org_membership.
    const junctions = await orgUserJunction.list({
      filter: {
        organizations_id: { _eq: selectedOrg.value },
        directus_users_id: { _eq: memberToRemove.value.id },
      },
      fields: ['id'],
    });
    if (junctions.length > 0) {
      await orgUserJunction.remove(junctions.map((j: any) => j.id));
    }
    const memberships = await membershipItems.list({
      filter: { organization: { _eq: selectedOrg.value }, user: { _eq: memberToRemove.value.id } },
      fields: ['id'],
    });
    for (const m of memberships) {
      await membershipItems.update(m.id, { status: 'suspended' });
    }
    toast.add({ title: 'Removed', description: 'Member removed from organization', color: 'green' });
    showRemoveMemberModal.value = false;
    memberToRemove.value = null;
    await fetchMembers();
  } catch (error) {
    console.error('Error removing member:', error);
    toast.add({ title: 'Error', description: 'Failed to remove member', color: 'red' });
  } finally {
    removingMember.value = false;
  }
}

// Client portal lifecycle
const clientActingId = ref<string | null>(null);
async function resendClientInvite(m: any) {
  if (!selectedOrg.value) return;
  clientActingId.value = m.id;
  try {
    const result = (await $fetch('/api/org/resend-client-invite', {
      method: 'POST',
      body: { membershipId: m.id, organizationId: selectedOrg.value },
    })) as any;
    toast.add({ title: 'Invitation resent', description: result?.message, color: 'green' });
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.message || e?.message || 'Failed to resend invitation', color: 'red' });
  } finally {
    clientActingId.value = null;
  }
}
async function revokeClientAccess(m: any) {
  if (!confirm('Revoke portal access for this user? They will no longer be able to sign in.')) return;
  clientActingId.value = m.id;
  try {
    await $fetch('/api/org/portal-user-status', {
      method: 'POST',
      body: { portalUserId: m.id, organizationId: selectedOrg.value, status: 'suspended' },
    });
    toast.add({ title: 'Access revoked', description: 'Portal access has been suspended.', color: 'green' });
    await fetchClientMemberships();
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.message || e?.message || 'Failed to revoke', color: 'red' });
  } finally {
    clientActingId.value = null;
  }
}
async function restoreClientAccess(m: any) {
  clientActingId.value = m.id;
  try {
    await $fetch('/api/org/portal-user-status', {
      method: 'POST',
      body: { portalUserId: m.id, organizationId: selectedOrg.value, status: 'active' },
    });
    toast.add({ title: 'Access restored', description: 'Portal access has been re-enabled.', color: 'green' });
    await fetchClientMemberships();
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.message || e?.message || 'Failed to restore', color: 'red' });
  } finally {
    clientActingId.value = null;
  }
}

// ── Billing floor ───────────────────────────────────────────────────────────
// Fully delegated to <AppsAccountSubscriptionSurface> (plan · add-ons · payment
// methods · billing history · cancel). No local subscription state needed here.

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

// Stripe Connect onboarding + operational surface moved to the Money app's
// Deposits floor (/apps/money?floor=deposits). This page keeps only the live
// status read (fetchStripeConnect) so the Integrations tile can show state.

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

const { socialPublishingEnabled } = useSocialPublishing();
const SOCIAL_INTEGRATION_KEYS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'threads'];

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

  const tiles = [
    {
      key: 'stripe-connect',
      label: 'Stripe Connect',
      desc: 'Accept card and ACH payments on invoices',
      icon: 'lucide:credit-card',
      status: stripeMeta?.status || 'inactive',
      statusLabel: stripeLabel,
      // Onboarding + the operational surface (balance / transactions / payouts)
      // now live on the Money app's Deposits floor. This tile is a status +
      // deep-link only.
      action: 'Open in Money',
      onClick: () => router.push('/apps/money?floor=deposits'),
    },
    {
      key: 'plaid',
      label: 'Plaid (Bank Sync)',
      desc: 'Auto-import transactions to expenses',
      icon: 'lucide:landmark',
      status: 'inactive' as IntegrationStatus,
      statusLabel: 'Available as add-on',
      action: 'Learn more',
      onClick: () => accountSubscriptionSlide.open('default'),
    },
    {
      key: 'daily',
      label: 'Daily (Video meetings)',
      desc: 'Built-in video rooms with recording + transcription',
      icon: 'lucide:video',
      status: 'active' as IntegrationStatus,
      statusLabel: 'Built-in',
      action: 'Open meetings',
      onClick: () => router.push('/apps/work?floor=calendar&history=1'),
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

  // Pre-launch: social connections ship after launch. While the publishing
  // kill-switch is off, show the social tiles as disabled "Coming soon" rows
  // moved to the bottom (rather than hiding them). The Marketing Accounts floor
  // is separately gated by the same flag.
  if (!socialPublishingEnabled.value) {
    const rest = tiles.filter((t) => !SOCIAL_INTEGRATION_KEYS.includes(t.key));
    const social = tiles
      .filter((t) => SOCIAL_INTEGRATION_KEYS.includes(t.key))
      .map((t) => ({
        ...t,
        status: 'inactive' as IntegrationStatus,
        statusLabel: 'Coming soon',
        comingSoon: true,
        action: 'Coming soon',
        onClick: () => {},
      }));
    return [...rest, ...social];
  }
  return tiles;
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
const accountSubscriptionSlide = useAppSlideOver('account-subscription');
const settingsTiles = [
  { label: 'Teams', desc: 'Group members for permissions and assignment', icon: 'lucide:user-cog', onClick: () => teamsSlide.open('_') },
  { label: 'Roles & permissions', desc: 'Custom roles and feature access matrix', icon: 'lucide:shield-check', onClick: () => rolesSlide.open('_') },
  { label: 'Documents library', desc: 'Reusable blocks + service offerings the proposal builder draws from', icon: 'lucide:blocks', onClick: () => documentsLibrarySlide.open('blocks') },
];

// Document theme studio — applied to invoices, proposals, contracts. Inline
// editor in the Settings floor; mirrors the classic /organization page so the
// user never has to leave /apps/* to change it.
const savingDocTheme = ref(false);
const localAccent = ref('#1f2937');
watch(() => (org.value as any)?.document_accent, (v) => { if (v) localAccent.value = v as string; }, { immediate: true });

async function saveDocumentStudio(payload: { theme: string; accent: string; config: Record<string, any> }) {
  if (!org.value?.id || savingDocTheme.value) return;
  savingDocTheme.value = true;
  try {
    await organizationItems.update(org.value.id, {
      document_theme: payload.theme,
      document_accent: payload.accent,
      document_theme_config: payload.config,
    });
    localAccent.value = payload.accent;
    toast.add({ title: 'Document theme saved', description: 'Applied to invoices, proposals, and contracts.', color: 'green' });
    await fetchOrganizationDetails();
  } catch (error: any) {
    toast.add({ title: 'Error', description: error?.data?.message || error?.message || 'Failed to save theme', color: 'red' });
  } finally {
    savingDocTheme.value = false;
  }
}

// Goals feature toggle — mirrors the control in the Overview editor, surfaced
// here in Settings where admins actually look for it. `goals_enabled !== false`
// counts as on (see useGoalsEnabled), so an unset org reads as enabled.
const savingGoals = ref(false);
const goalsEnabled = computed(() => org.value?.goals_enabled !== false);
async function saveGoalsEnabled(next: boolean) {
  if (!org.value?.id || savingGoals.value) return;
  savingGoals.value = true;
  try {
    await organizationItems.update(org.value.id, { goals_enabled: next });
    toast.add({
      title: next ? 'Goals enabled' : 'Goals hidden',
      description: next
        ? 'Goals are visible to everyone in this organization.'
        : 'Goals are hidden across this organization.',
      color: 'green',
    });
    await fetchOrganizationDetails();
  } catch (error: any) {
    toast.add({ title: 'Error', description: error?.data?.message || error?.message || 'Failed to update goals setting', color: 'red' });
  } finally {
    savingGoals.value = false;
  }
}

const isArchived = computed(() => !!org.value?.archived_at);

// Danger-zone archive/restore confirm sheet (Settings floor).
const showArchiveSheet = ref(false);

// ── Lazy-load per floor ─────────────────────────────────────────────────────
const overviewLoaded = ref(false);
const membersLoaded = ref(false);
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
    // Billing floor self-loads via <AppsAccountSubscriptionSurface>.
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
  if (integrationsLoaded.value) {
    fetchStripeConnect();
    fetchSocialAccounts();
  }
});

// ── Overview edit mode ──────────────────────────────────────────────────────
// `?edit=1` flips the Overview floor into the inline OverviewEditor in place
// of the read-only summary. The Edit / Done header button toggles it; no
// route navigation, no shell remount.
const editingOverview = computed(() => route.query.edit === '1');

function toggleOverviewEdit() {
  const { edit, ...rest } = route.query;
  void edit;
  router.replace({
    query: editingOverview.value ? rest : { ...rest, edit: '1' },
  });
}

// ── Header action ───────────────────────────────────────────────────────────
const headerAction = computed(() => {
  if (floor.value === 'overview' && canManageOrg.value) {
    return editingOverview.value
      ? { label: 'Done', icon: 'lucide:check', onClick: toggleOverviewEdit }
      : { label: 'Edit', icon: 'lucide:pencil', onClick: toggleOverviewEdit };
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
  return null;
});

function openRestoreFromBanner() {
  floor.value = 'settings';
  showArchiveSheet.value = true;
}

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
        <Button size="sm" variant="outline" @click="openRestoreFromBanner">
          Restore
        </Button>
      </div>

      <Transition :name="floorTransition" mode="out-in">
      <div :key="floor">
      <!-- ── Overview floor ───────────────────────────────────────────── -->
      <template v-if="floor === 'overview'">
        <div v-if="!org" class="flex flex-col items-center justify-center py-24 gap-3">
          <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
          <p class="text-sm text-muted-foreground">Loading organization…</p>
        </div>
        <template v-else-if="editingOverview && canManageOrg">
          <AppsOrganizationOverviewEditor :can-manage="canManageOrg" />
        </template>
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
                    <p v-if="org.slug" class="text-[11px] text-muted-foreground mt-0.5">
                      Booking slug: <span class="font-mono text-foreground">{{ org.slug }}</span>
                    </p>
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
              <div class="flex items-center gap-3">
                <span class="text-xs text-muted-foreground">{{ filteredUsers.length }} member{{ filteredUsers.length === 1 ? '' : 's' }}</span>
                <Button v-if="canManageOrg" size="sm" variant="outline" @click="openAddMemberModal">
                  <Icon name="lucide:user-plus" class="w-4 h-4 mr-1" />
                  Add existing
                </Button>
              </div>
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
                class="ios-card p-4 flex flex-col gap-3"
              >
                <!-- Top row: avatar + identity + remove -->
                <div class="flex items-center gap-3">
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
                  <button
                    v-if="canManageOrg && member.id !== currentUserId && getMemberRole(member.id)?.slug !== 'owner'"
                    type="button"
                    class="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    :title="`Remove ${member.first_name}`"
                    @click="confirmRemoveMember(member)"
                  >
                    <Icon name="lucide:user-minus" class="w-3.5 h-3.5" />
                  </button>
                </div>

                <!-- Role row: editable select for admins, badge otherwise -->
                <div v-if="getMemberRole(member.id)" class="flex items-center justify-between">
                  <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Role</span>
                  <select
                    v-if="canManageOrg && member.id !== currentUserId && getMemberRole(member.id).slug !== 'owner'"
                    class="text-xs rounded-full border bg-background px-2.5 py-1 cursor-pointer focus:outline-none"
                    :value="getMemberRole(member.id).id"
                    :disabled="changingRole"
                    @change="changeMemberRole(member.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="role in assignableRoles" :key="role.id" :value="role.id">
                      {{ role.name }}
                    </option>
                  </select>
                  <span
                    v-else
                    class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium shrink-0"
                    :class="getRoleBadgeClasses(getMemberRole(member.id).slug)"
                  >
                    {{ getMemberRole(member.id).name }}
                  </span>
                </div>
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
                class="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-center px-4 py-3 border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
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
                    :to="`/apps/clients/${m.client.id}`"
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

                <!-- Lifecycle actions (owner/admin) -->
                <div class="flex items-center justify-end gap-1">
                  <template v-if="canManageOrg">
                    <button
                      v-if="m.status === 'pending'"
                      type="button"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      title="Resend invitation"
                      :disabled="clientActingId === m.id"
                      @click="resendClientInvite(m)"
                    >
                      <Icon :name="clientActingId === m.id ? 'lucide:loader-2' : 'lucide:send'" class="w-3.5 h-3.5" :class="clientActingId === m.id && 'animate-spin'" />
                    </button>
                    <button
                      v-if="m.status === 'suspended'"
                      type="button"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                      title="Restore access"
                      :disabled="clientActingId === m.id"
                      @click="restoreClientAccess(m)"
                    >
                      <Icon :name="clientActingId === m.id ? 'lucide:loader-2' : 'lucide:rotate-ccw'" class="w-3.5 h-3.5" :class="clientActingId === m.id && 'animate-spin'" />
                    </button>
                    <button
                      v-if="m.status !== 'suspended'"
                      type="button"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title="Revoke access"
                      :disabled="clientActingId === m.id"
                      @click="revokeClientAccess(m)"
                    >
                      <Icon name="lucide:user-x" class="w-3.5 h-3.5" />
                    </button>
                  </template>
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
            <button type="button" @click="teamsSlide.open(t.id)"
              v-for="t in visibleTeams"
              :key="t.id"
              class="w-full text-left ios-card p-4 hover:bg-muted/30 transition-colors"
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
            </button>
          </div>
        </div>
      </template>

      <!-- ── Billing floor ───────────────────────────────── -->
      <!-- Canonical subscription surface (plan · add-ons · payment methods ·
           billing history · cancel) — the shared component also backs the
           Stripe Checkout return receiver at /account/subscription. Stripe
           Connect (getting paid by your clients) lives in the Money app. -->
      <template v-else-if="floor === 'billing'">
        <AppsAccountSubscriptionSurface compact />
      </template>

      <!-- ── AI & Tokens floor ────────────────────────────────────────── -->
      <!-- Usage meter, per-member breakdown, purchase, and org/member
           limits. OrganizationAIUsage self-loads; `manage-expanded` seeds
           the token-management panel open since this floor is where admins
           come specifically to manage AI spend. -->
      <template v-else-if="floor === 'ai'">
        <OrganizationAIUsage
          v-if="selectedOrg"
          :organization-id="selectedOrg"
          manage-expanded
        />
        <div v-else class="flex items-center justify-center py-16 gap-3">
          <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-muted-foreground" />
          <span class="text-sm text-muted-foreground">Loading…</span>
        </div>
      </template>

      <!-- ── Communications ("Email") floor ───────────────────────────── -->
      <!-- Org-level transactional email settings (reply-to, footer address,
           silent BCC, whitelabel) + live template preview. The marketing /
           newsletter HTML builder stays in the Marketing app. -->
      <template v-else-if="floor === 'communications'">
        <AppsOrganizationCommunicationsSurface :can-manage="canManageOrg" />
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
            class="flex items-center gap-4 px-4 py-3 transition-colors"
            :class="[
              idx > 0 ? 'border-t border-border/30' : '',
              item.comingSoon ? 'opacity-55' : 'hover:bg-muted/20',
            ]"
          >
            <div class="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Icon :name="item.icon" class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium">{{ item.label }}</p>
              <p class="text-xs text-muted-foreground truncate">{{ item.desc }}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span
                v-if="item.comingSoon"
                class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground"
              >
                Coming soon
              </span>
              <template v-else>
                <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span :class="['w-1.5 h-1.5 rounded-full', statusDotClass(item.status)]" />
                  {{ item.statusLabel }}
                </span>
                <Button size="sm" variant="ghost" @click="item.onClick">
                  {{ item.action }}
                  <Icon name="lucide:chevron-right" class="w-3.5 h-3.5 ml-1" />
                </Button>
              </template>
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
                class="ios-card p-4 flex items-start gap-3 hover:ring-2 hover:ring-primary/30 transition-all group text-left w-full"
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
            <p class="text-xs text-muted-foreground mb-4">
              Style every invoice, proposal, and contract you send — preview updates live.
            </p>
            <DocumentsDocumentThemeStudio
              :theme="org.document_theme || 'classic'"
              :accent="org.document_accent || '#1f2937'"
              :config="(org as any).document_theme_config || null"
              :saving="savingDocTheme"
              @save="saveDocumentStudio"
            />
          </div>

          <!-- Features — org-wide feature switches. Goals lives here (not just
               in the Overview editor) so admins find it where they look. -->
          <div v-if="canManageOrg && org" class="ios-card p-5">
            <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">
              Features
            </h3>
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium">Goals</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ goalsEnabled
                    ? 'Goals are visible to everyone in this organization.'
                    : 'Goals are hidden across this organization — nav, cards, and dashboard widgets.' }}
                </p>
              </div>
              <UToggle
                :model-value="goalsEnabled"
                :disabled="savingGoals"
                class="mt-0.5 shrink-0"
                @update:model-value="saveGoalsEnabled"
              />
            </div>
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
              This organization is archived. Restore it using “Manage archive” below.
            </p>
            <Button size="sm" variant="outline" class="text-destructive border-destructive/30" @click="showArchiveSheet = true">
              <Icon name="lucide:archive" class="w-4 h-4 mr-1" />
              {{ isArchived ? 'Manage archive' : 'Archive organization' }}
            </Button>
          </div>
        </div>
      </template>
      </div>
      </Transition>
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

    <!-- Add an existing Earnest user to this org -->
    <UModal v-model="showAddMemberModal">
      <div class="p-5 space-y-4">
        <div>
          <h3 class="text-base font-semibold">Add existing user</h3>
          <p class="text-xs text-muted-foreground mt-0.5">
            Search users already in Earnest and add them to this organization.
          </p>
        </div>
        <UInput
          v-model="searchEmail"
          placeholder="Search by name or email…"
          icon="i-heroicons-magnifying-glass"
          autofocus
        />
        <div v-if="searching" class="flex justify-center py-6">
          <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="searchEmail.length >= 2 && !searchResults.length" class="text-center py-6 text-sm text-muted-foreground">
          No matching users found.
        </div>
        <div v-else-if="searchResults.length" class="space-y-2 max-h-72 overflow-y-auto">
          <div
            v-for="u in searchResults"
            :key="u.id"
            class="flex items-center gap-3 p-2.5 rounded-xl border border-border/40"
          >
            <div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
              <img
                v-if="u.avatar"
                :src="`${config.public.directusUrl}/assets/${u.avatar}?key=small`"
                :alt="`${u.first_name} ${u.last_name}`"
                class="w-full h-full object-cover"
              />
              <span v-else class="text-xs font-medium text-muted-foreground">
                {{ (u.first_name?.[0] || '') + (u.last_name?.[0] || '') }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ u.first_name }} {{ u.last_name }}</p>
              <p class="text-xs text-muted-foreground truncate">{{ u.email }}</p>
            </div>
            <Button size="sm" :disabled="addingUser" @click="addUserToOrganization(u.id)">Add</Button>
          </div>
        </div>
      </div>
    </UModal>

    <!-- Remove member confirmation -->
    <UModal v-model="showRemoveMemberModal">
      <div class="p-5 space-y-4">
        <div>
          <h3 class="text-base font-semibold">Remove member</h3>
          <p class="text-sm text-muted-foreground mt-1">
            Remove
            <span class="font-medium text-foreground">{{ memberToRemove?.first_name }} {{ memberToRemove?.last_name }}</span>
            from this organization? They lose access immediately. This does not delete their user account.
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" :disabled="removingMember" @click="showRemoveMemberModal = false">Cancel</Button>
          <Button variant="destructive" :disabled="removingMember" @click="removeMember">
            <Icon :name="removingMember ? 'lucide:loader-2' : 'lucide:user-minus'" class="w-4 h-4 mr-1" :class="removingMember && 'animate-spin'" />
            Remove
          </Button>
        </div>
      </div>
    </UModal>

    <!-- Danger-zone archive / restore confirm sheet (Settings floor). -->
    <AppsOrganizationArchiveOrgSheet
      v-model="showArchiveSheet"
      :org-id="org?.id ?? selectedOrg ?? null"
      :org-name="orgName"
      :is-archived="isArchived"
    />
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.apps-page {
  @apply flex flex-col h-full;
}
</style>
