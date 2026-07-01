/**
 * useAiPendingActions — shared count of `pending` ai_actions (the HITL approval
 * queue) for the active org. Feeds the badge on the AI panel's Activity tab and
 * is available to any rail/launcher that wants to surface the review backlog.
 *
 * State is a `useState` singleton so every consumer reads the same number and a
 * refresh from one (e.g. after approve/reject in <AiActivityList>) updates all.
 */
export function useAiPendingActions() {
  const { selectedOrg } = useOrganization();
  const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || '');

  const pendingCount = useState<number>('ai-pending-actions-count', () => 0);
  const loading = useState<boolean>('ai-pending-actions-loading', () => false);

  async function refresh() {
    if (!organizationId.value) {
      pendingCount.value = 0;
      return;
    }
    if (loading.value) return;
    loading.value = true;
    try {
      const res = await $fetch<{ count: number }>('/api/ai/actions/pending-count', {
        query: { organizationId: organizationId.value },
      });
      pendingCount.value = Number(res?.count ?? 0);
    } catch {
      // Fail soft — a badge must never break the shell.
    } finally {
      loading.value = false;
    }
  }

  return { pendingCount, loading, refresh, organizationId };
}
