/**
 * Org-level weather-widget visibility.
 *
 * Organizations can show a small local-weather widget next to the org avatar in
 * the app header via the `organizations.weather_enabled` boolean (set in the org
 * settings editor, same place as Goals). Opt-in: OFF unless explicitly enabled,
 * so existing orgs and anyone who hasn't turned it on see no change.
 */
export function useWeatherEnabled() {
  const { currentOrg } = useOrganization();
  const weatherEnabled = computed(() => (currentOrg.value as any)?.weather_enabled === true);
  return { weatherEnabled };
}
