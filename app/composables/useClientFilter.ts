/**
 * useClientFilter — LOCAL, per-surface client filter state.
 *
 * The app-chrome global client filter was deliberately removed (it was honored
 * inconsistently across widgets, so it read as a broken promise — see
 * `LayoutClientSelect` + docs/dashboard-filters-localization-poc.md). This is
 * its deliberate opposite: a small piece of state that lives on ONE board/list
 * and never leaks to the chrome or to sibling surfaces.
 *
 * Call it once at the top of a board's `setup()`, bind `clientId` to a
 * `<ClientFilterSelect v-model>`, and fold `clientFilter.value` into whatever
 * Directus filter the board already builds. Each call site gets its own ref —
 * two boards mounted at once keep independent selections (that's the point).
 *
 * NOT backed by `useState`/cookies on purpose. If we ever want a board to
 * remember its client across reloads, wire a `useStorageSync` here behind an
 * opt-in key — but the default is intentionally ephemeral so the "global
 * filter" foot-gun can't creep back in.
 *
 * Sentinel semantics mirror the old `useClients().getClientFilter()`:
 *   null   → {}                        (All clients — no filter)
 *   'org'  → { <field>: { _null: true } }  (org's own work, no client assigned)
 *   UUID   → { <field>: { _eq: UUID } }     (one specific client)
 */
export function useClientFilter(opts: { field?: string } = {}) {
  // The relation column to filter on. Defaults to `client` (tickets, projects,
  // invoices, contracts). The Tasks floor filters the parent `tickets`
  // collection, so it also uses `client`. Pass `client_id` for a surface that
  // queries the `tasks` collection directly.
  const field = opts.field ?? 'client';

  const clientId = ref<string | null>(null);

  const clientFilter = computed<Record<string, any>>(() => {
    const id = clientId.value;
    if (!id) return {};
    if (id === 'org') return { [field]: { _null: true } };
    return { [field]: { _eq: id } };
  });

  const hasClientFilter = computed(() => !!clientId.value);

  function clearClientFilter() {
    clientId.value = null;
  }

  return {
    clientId,
    clientFilter,
    hasClientFilter,
    clearClientFilter,
  };
}
