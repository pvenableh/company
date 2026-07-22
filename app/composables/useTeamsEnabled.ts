/**
 * Org-level Teams visibility.
 *
 * Organizations can turn the whole Teams feature off via the
 * `organizations.teams_enabled` boolean (set in the org settings editor, same
 * place as Goals + the weather widget). When off, team surfaces are hidden
 * everywhere: the "All teams" selector on the Work floors, team fields in the
 * ticket forms, the org Teams floor + settings tile, and team chips in lists.
 *
 * Opt-OUT: `null`/`undefined` counts as ENABLED (orgs that pre-date the field,
 * and anyone already using teams, keep them) — only an explicit `false` hides
 * the feature. Contrast `useWeatherEnabled`, which is opt-in/default-off.
 *
 * This only hides UI — team values already stored on tickets/projects are
 * preserved on save, so re-enabling brings everything back untouched.
 */
export function useTeamsEnabled() {
  const { currentOrg } = useOrganization();
  const teamsEnabled = computed(() => (currentOrg.value as any)?.teams_enabled !== false);
  return { teamsEnabled };
}
