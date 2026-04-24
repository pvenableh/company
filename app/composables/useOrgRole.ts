import type { OrgMembership, OrgRole } from '~~/shared/directus';
import type { FeatureKey, CrudAction, PermissionMatrix, RoleSlug } from '~~/shared/permissions';
import { DEFAULT_ROLE_PERMISSIONS } from '~~/shared/permissions';

// Plan hierarchy for tier comparisons (values from organizations.plan field)
const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  solo: 1,
  studio: 2,
  agency: 3,
  enterprise: 4,
};

// Features that are truly plan-restricted (not resource-limited).
// Per business model: all features available on all plans except white-label.
const PLAN_GATED_FEATURES: Record<string, string> = {
  white_label: 'agency', // Agency tier + $19/mo add-on gates the UI; this gates the plan tier.
};

/**
 * useOrgRole — Per-org role + permission composable
 *
 * Fetches the current user's membership in the selected org and exposes
 * role info, permission checks, and computed role booleans.
 *
 * When no org_membership exists (pre-migration users), a fallback maps
 * the user's Directus global role to a default org role so the permission
 * system remains functional.
 */
export function useOrgRole() {
  const membershipItems = useDirectusItems<OrgMembership>('org_memberships');

  const { user } = useDirectusAuth();
  const { selectedOrg } = useOrganization();

  // ── State ───────────────────────────────────────────────────────────────────
  const membership = useState<OrgMembership | null>('orgMembership', () => null);
  const orgRole = useState<OrgRole | null>('orgRole', () => null);
  const loading = useState<boolean>('orgRoleLoading', () => false);
  const error = useState<string | null>('orgRoleError', () => null);

  // ── Computed role booleans ──────────────────────────────────────────────────
  const roleSlug = computed<RoleSlug | null>(() => {
    if (!orgRole.value) return null;
    return orgRole.value.slug as RoleSlug;
  });

  const isOrgOwner = computed(() => roleSlug.value === 'owner');
  const isOrgAdmin = computed(() => roleSlug.value === 'admin');
  const isOrgManager = computed(() => roleSlug.value === 'manager');
  const isOrgMember = computed(() => roleSlug.value === 'member');
  const isOrgClient = computed(() => roleSlug.value === 'client');

  /** True if the user has owner or admin level access */
  const isOrgAdminOrAbove = computed(() => isOrgOwner.value || isOrgAdmin.value);

  /** True if the user is at least a manager */
  const isOrgManagerOrAbove = computed(
    () => isOrgOwner.value || isOrgAdmin.value || isOrgManager.value
  );

  /** True if the user has an active membership in the current org */
  const hasMembership = computed(() => !!membership.value && membership.value.status === 'active');

  /** The client FK if this is a client-scoped membership */
  const clientScope = computed(() => {
    if (!membership.value) return null;
    const client = membership.value.client;
    if (!client) return null;
    return typeof client === 'string' ? client : client.id;
  });

  /** The full client object for display (name, id) — null if not client-scoped */
  const clientData = computed(() => {
    if (!membership.value?.client) return null;
    const client = membership.value.client;
    return typeof client === 'object' ? client : null;
  });

  // ── Permission matrix ──────────────────────────────────────────────────────
  const permissions = computed<PermissionMatrix | null>(() => {
    if (!orgRole.value?.permissions) return null;
    return orgRole.value.permissions as PermissionMatrix;
  });

  /**
   * Check if the current user can access a feature at all.
   * Owner/Admin always returns true.
   * When no user is logged in, returns true to avoid blocking pre-auth UI.
   */
  function canAccess(feature: FeatureKey): boolean {
    if (!user.value) return true;
    if (isOrgAdminOrAbove.value) return true;
    if (!permissions.value) return false;
    return permissions.value[feature]?.access ?? false;
  }

  /**
   * Check a specific CRUD action on a feature.
   * Owner/Admin always returns true.
   */
  function hasPermission(feature: FeatureKey, action: CrudAction): boolean {
    if (isOrgAdminOrAbove.value) return true;
    if (!permissions.value) return false;
    const fp = permissions.value[feature];
    if (!fp?.access) return false;
    return fp[action] ?? false;
  }

  /** Convenience wrappers */
  function canView(feature: FeatureKey): boolean {
    return canAccess(feature) && hasPermission(feature, 'read');
  }

  function canCreate(feature: FeatureKey): boolean {
    return hasPermission(feature, 'create');
  }

  function canEdit(feature: FeatureKey): boolean {
    return hasPermission(feature, 'update');
  }

  function canDelete(feature: FeatureKey): boolean {
    return hasPermission(feature, 'delete');
  }

  // ── Directus role → org role fallback ────────────────────────────────────────
  // When no org_membership exists (pre-migration), map the user's Directus
  // global role to a default org role so the permission system still works.
  const config = useRuntimeConfig();

  function getFallbackRoleSlug(): RoleSlug | null {
    if (!user.value) return null;
    const roleId = typeof user.value.role === 'object'
      ? (user.value.role as any)?.id
      : user.value.role;
    if (!roleId) return null;

    const adminRoleId = config.public.adminRole || config.public.adminRoleId;
    const clientManagerRoleId = config.public.clientManagerRoleId || '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb';

    if (roleId === adminRoleId) return 'admin';
    if (roleId === clientManagerRoleId) return 'manager';
    return 'member';
  }

  function applyFallbackRole(): void {
    const slug = getFallbackRoleSlug();
    if (!slug) {
      orgRole.value = null;
      return;
    }

    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[slug];

    orgRole.value = {
      id: `fallback-${slug}`,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      slug,
      is_system: true,
      permissions: defaultPerms,
    } as unknown as OrgRole;
  }

  // ── Fetch membership ───────────────────────────────────────────────────────
  async function fetchMembership(): Promise<void> {
    if (!user.value?.id || !selectedOrg.value) {
      membership.value = null;
      orgRole.value = null;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const results = await membershipItems.list({
        filter: {
          _and: [
            { organization: { _eq: selectedOrg.value } },
            { user: { _eq: user.value.id } },
          ],
        },
        fields: [
          '*',
          'role.id',
          'role.name',
          'role.slug',
          'role.is_system',
          'role.permissions',
          'client.id',
          'client.name',
        ],
        limit: 1,
      });

      if (results.length > 0) {
        membership.value = results[0];
        orgRole.value = (typeof results[0].role === 'object' ? results[0].role : null) as OrgRole | null;
      } else {
        // No org_membership found — apply fallback from Directus global role
        membership.value = null;
        applyFallbackRole();
      }
    } catch (err: any) {
      console.error('Failed to fetch org membership:', err);
      error.value = err.message || 'Failed to fetch membership';
      membership.value = null;
      // Still apply fallback so the app is usable
      applyFallbackRole();
    } finally {
      loading.value = false;
    }
  }

  // ── Plan gating ───────────────────────────────────────────────────────────
  const { currentOrg } = useOrganization();

  /**
   * Check if the org's plan allows a specific feature.
   * Per business model: all features are available on all paid plans.
   * Only white-label is gated to agency/enterprise tier.
   * Resource limits (tokens, scans, seats) are enforced server-side.
   */
  function planAllows(feature: string): boolean {
    const orgPlan = (currentOrg.value as any)?.plan ?? 'free';
    const requiredPlan = PLAN_GATED_FEATURES[feature];
    if (!requiredPlan) return true; // Not gated = allowed on all plans
    const orgLevel = PLAN_HIERARCHY[orgPlan] ?? 0;
    const requiredLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;
    return orgLevel >= requiredLevel;
  }

  /** The org's current plan tier string (e.g. 'free', 'solo', 'studio', 'agency', 'enterprise') */
  const orgPlan = computed(() => (currentOrg.value as any)?.plan ?? 'free');

  /**
   * Check if the org has an active add-on subscription.
   * Add-ons are managed by Stripe webhooks and stored in organizations.active_addons.
   */
  function hasAddon(addonId: string): boolean {
    const addons = (currentOrg.value as any)?.active_addons;
    if (!addons || typeof addons !== 'object') return false;
    return !!addons[addonId];
  }

  // ── Auto-fetch when org or user changes ────────────────────────────────────
  if (import.meta.client) {
    watch(
      [() => selectedOrg.value, () => user.value?.id],
      ([newOrg, newUser]) => {
        if (newOrg && newUser) {
          fetchMembership();
        } else {
          membership.value = null;
          orgRole.value = null;
        }
      },
      { immediate: true }
    );
  }

  return {
    // State
    membership: readonly(membership),
    orgRole: readonly(orgRole),
    loading: readonly(loading),
    error: readonly(error),
    roleSlug,

    // Role booleans
    isOrgOwner,
    isOrgAdmin,
    isOrgManager,
    isOrgMember,
    isOrgClient,
    isOrgAdminOrAbove,
    isOrgManagerOrAbove,
    hasMembership,
    clientScope,
    clientData,

    // Permission checks
    permissions,
    canAccess,
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,

    // Plan gating & add-ons
    planAllows,
    orgPlan,
    hasAddon,

    // Actions
    fetchMembership,
  };
}
