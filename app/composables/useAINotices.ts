/**
 * Proactive AI Notices composable — fetches and manages
 * entity-specific AI observations with localStorage dismissal.
 */

interface AINotice {
  id: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  type: 'warning' | 'insight' | 'suggestion';
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionRoute?: string;
}

const DISMISSED_KEY = 'ai-notices-dismissed';

export function useAINotices() {
  const { selectedOrg } = useOrganization();
  const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || '');

  const notices = ref<AINotice[]>([]);
  const isLoading = ref(false);
  const dismissedIds = ref<Set<string>>(new Set());

  // Load dismissed IDs from localStorage
  if (import.meta.client) {
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        dismissedIds.value = new Set(parsed);
      }
    } catch { /* ignore */ }
  }

  const visibleNotices = computed(() =>
    notices.value.filter(n => !dismissedIds.value.has(n.id)),
  );

  const fetchNotices = async (entityType: string, entityId: string) => {
    if (!organizationId.value || !entityId || import.meta.server) return;

    isLoading.value = true;
    try {
      const response = await $fetch('/api/ai/notices', {
        params: {
          entityType,
          entityId,
          organizationId: organizationId.value,
        },
      }) as any;
      notices.value = response?.notices || [];
    } catch (err: any) {
      console.warn('[useAINotices] Failed to fetch notices:', err.message);
      notices.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  const dismissNotice = (noticeId: string) => {
    dismissedIds.value.add(noticeId);
    if (import.meta.client) {
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedIds.value]));
      } catch { /* ignore */ }
    }
  };

  const clearDismissed = () => {
    dismissedIds.value.clear();
    if (import.meta.client) {
      try { localStorage.removeItem(DISMISSED_KEY); } catch { /* ignore */ }
    }
  };

  return {
    notices,
    visibleNotices,
    isLoading,
    fetchNotices,
    dismissNotice,
    clearDismissed,
  };
}
