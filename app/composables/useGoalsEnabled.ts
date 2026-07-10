/**
 * Org-level goals visibility.
 *
 * Organizations can turn the whole Goals feature off via the
 * `organizations.goals_enabled` boolean (set in the org settings editor). When
 * off, goals surfaces are hidden everywhere: the Account → Goals nav section,
 * the shared "Goals in this lens" related-goals cards on app floors, and the
 * dashboard goal widgets.
 *
 * `null`/`undefined` counts as enabled so orgs that pre-date the field keep
 * their goals — only an explicit `false` hides them.
 */
export function useGoalsEnabled() {
  const { currentOrg } = useOrganization();
  const goalsEnabled = computed(() => currentOrg.value?.goals_enabled !== false);
  return { goalsEnabled };
}
