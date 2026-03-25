/**
 * useViewAsOrgAdmin — Directus system admin detection.
 *
 * Directus admins automatically function as org admins for whichever organization
 * they have selected — like a Facebook user who is admin of multiple Pages.
 * They see the full admin experience (TokenMeter, member usage, plan gating)
 * for every org they switch to.
 *
 * This composable detects whether the current user is a Directus system admin
 * so components can grant them org-admin-level visibility on any org.
 */

export function useViewAsOrgAdmin() {
  const config = useRuntimeConfig();
  const { user } = useDirectusAuth();

  /** Whether the current user is a Directus system admin (not just an org admin) */
  const isDirectusAdmin = computed(() => {
    if (!user.value) return false;
    const roleId = typeof user.value.role === 'object'
      ? (user.value.role as any)?.id
      : user.value.role;
    const adminRoleId = config.public.adminRole || config.public.adminRoleId;
    return roleId === adminRoleId;
  });

  return {
    isDirectusAdmin,
  };
}
