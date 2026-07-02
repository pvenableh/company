/**
 * useClientScores — org-wide client A–F ratings, loaded once and shared.
 *
 * One request to /api/crm/client-scores fills a { [clientId]: ClientScore } map
 * that every client card / detail badge (and a connected contact's company
 * reference) reads from. Call load(orgId) once where clients are listed; badges
 * just call getScore(clientId).
 */
export interface ClientScore {
  clientId: string;
  name: string;
  rating: 'A' | 'B' | 'C' | 'D' | 'F';
  revenue: number;
  activeProjects: number;
  effort: number;
  overdueAR: number;
  outstandingAR: number;
  staleDays: number | null;
}

export function useClientScores() {
  const scores = useState<Record<string, ClientScore>>('client-scores', () => ({}));
  const loadedOrg = useState<string | null>('client-scores-org', () => null);
  const loading = useState<boolean>('client-scores-loading', () => false);

  async function load(organizationId?: string | null, force = false) {
    if (!organizationId) return;
    if (loading.value) return;
    if (!force && loadedOrg.value === organizationId) return;
    loading.value = true;
    try {
      const res = await $fetch<{ scores: Record<string, ClientScore> }>('/api/crm/client-scores', {
        query: { organizationId },
      });
      scores.value = res.scores || {};
      loadedOrg.value = organizationId;
    } catch {
      // Soft-fail: badges simply don't render until scores load.
    } finally {
      loading.value = false;
    }
  }

  function getScore(clientId?: string | null): ClientScore | null {
    if (!clientId) return null;
    return scores.value[String(clientId)] || null;
  }

  return { scores, loading, load, getScore };
}
