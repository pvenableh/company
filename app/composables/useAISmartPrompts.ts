/**
 * Data-driven AI prompt suggestions — contextual suggestions based on the
 * user's actual business state.
 *
 * Uses data from useAIProductivityEngine metrics + live Directus queries
 * to generate prompts like "Follow up with Acme Corp — no activity in 21 days".
 */

interface SmartPrompt {
  text: string;
  priority: number; // higher = more important, shown first
  category: 'clients' | 'invoices' | 'projects' | 'tasks' | 'deals' | 'general';
}

interface SmartPromptData {
  staleClients: Array<{ name: string; daysInactive: number }>;
  overdueInvoices: { count: number; total: number };
  overdueProjects: Array<{ title: string }>;
  overdueTasks: number;
  pendingTasks: number;
  openDeals: { count: number; pipelineValue: number };
  upcomingMeetings: number;
}

// Module-level cache to avoid re-fetching on every composable call
const _smartData = ref<SmartPromptData | null>(null);
const _smartDataLoading = ref(false);
const _smartDataExpiry = ref(0);
const SMART_DATA_TTL = 120_000; // 2 minutes

export function useAISmartPrompts() {
  // Guard: useDirectusItems uses lodash internally and fails during SSR
  if (import.meta.server) {
    return {
      smartData: _smartData,
      isLoading: _smartDataLoading,
      fetchSmartData: async () => {},
      getSmartPrompts: () => getStaticPrompts(),
    };
  }

  const { selectedOrg } = useOrganization();
  const { selectedClient, getClientFilter } = useClients();
  const { user } = useDirectusAuth();

  const clientItems = useDirectusItems('clients');
  const invoiceItems = useDirectusItems('invoices');
  const projectItems = useDirectusItems('projects');
  const taskItems = useDirectusItems('tasks');
  const leadItems = useDirectusItems('leads');

  const orgFilter = () => selectedOrg.value ? { organization: { _eq: selectedOrg.value } } : {};
  // Invoices have no direct `organization` column — they use `bill_to` for the
  // org reference (matching useInvoices / useAIProductivityEngine). Filtering on
  // `organization` here 403s ("field does not exist").
  const invoiceOrgFilter = () => selectedOrg.value ? { bill_to: { _eq: selectedOrg.value } } : {};

  /** Fetch live data for prompt generation */
  const fetchSmartData = async () => {
    if (_smartDataLoading.value) {
      console.debug('[SmartPrompts] Skipping fetch — already loading');
      return;
    }
    if (_smartData.value && Date.now() < _smartDataExpiry.value) {
      console.debug('[SmartPrompts] Using cached data, expires in', Math.round((_smartDataExpiry.value - Date.now()) / 1000), 's');
      return;
    }

    console.debug('[SmartPrompts] Fetching live data...', { org: selectedOrg.value, user: user.value?.id });
    _smartDataLoading.value = true;
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const [clients, invoices, projects, tasks, leads] = await Promise.all([
        // Stale clients
        clientItems.list({
          filter: { ...orgFilter(), status: { _eq: 'active' } },
          fields: ['id', 'name', 'date_updated'],
          sort: ['date_updated'],
          limit: 10,
        }).catch(() => []) as Promise<Array<{ id: string; name: string; date_updated: string }>>,

        // Overdue invoices
        invoiceItems.list({
          filter: {
            ...invoiceOrgFilter(),
            status: { _in: ['pending', 'processing'] },
            due_date: { _lt: now.toISOString() },
          },
          fields: ['id', 'total_amount'],
          limit: 50,
        }).catch(() => []) as Promise<Array<{ id: string; total_amount: number }>>,

        // Active projects
        projectItems.list({
          filter: {
            ...orgFilter(),
            status: { _in: ['Pending', 'Scheduled', 'In Progress'] },
          },
          fields: ['id', 'title', 'status', 'due_date'],
          sort: ['due_date'],
          limit: 15,
        }).catch(() => []) as Promise<Array<{ id: string; title: string; status: string; due_date: string }>>,

        // User's tasks
        taskItems.list({
          filter: { assigned_to: { directus_users_id: { _eq: user.value?.id } } },
          fields: ['id', 'status', 'due_date'],
          limit: 50,
        }).catch(() => []) as Promise<Array<{ id: string; status: string; due_date: string }>>,

        // Open leads
        leadItems.list({
          filter: {
            ...orgFilter(),
            status: { _eq: 'published' },
            stage: { _nin: ['won', 'lost'] },
          },
          fields: ['id', 'estimated_value'],
          limit: 20,
        }).catch(() => []) as Promise<Array<{ id: string; estimated_value: number }>>,
      ]);

      const staleClients = (clients || [])
        .filter(c => c.date_updated && new Date(c.date_updated) < new Date(fourteenDaysAgo))
        .map(c => ({
          name: c.name,
          daysInactive: Math.floor((now.getTime() - new Date(c.date_updated).getTime()) / (1000 * 60 * 60 * 24)),
        }))
        .sort((a, b) => b.daysInactive - a.daysInactive);

      const overdueProjects = (projects || [])
        .filter(p => p.due_date && new Date(p.due_date) < now)
        .map(p => ({ title: p.title }));

      const pendingTasks = (tasks || []).filter(t => t.status !== 'completed');
      const overdueTasks = pendingTasks.filter(t => t.due_date && new Date(t.due_date) < now);

      _smartData.value = {
        staleClients,
        overdueInvoices: {
          count: (invoices || []).length,
          total: (invoices || []).reduce((sum, i) => sum + (i.total_amount || 0), 0),
        },
        overdueProjects,
        overdueTasks: overdueTasks.length,
        pendingTasks: pendingTasks.length,
        openDeals: {
          count: (leads || []).length,
          pipelineValue: (leads || []).reduce((sum, l) => sum + (l.estimated_value || 0), 0),
        },
        upcomingMeetings: 0,
      };
      _smartDataExpiry.value = Date.now() + SMART_DATA_TTL;
      console.debug('[SmartPrompts] Data fetched:', {
        staleClients: _smartData.value?.staleClients.length,
        overdueInvoices: _smartData.value?.overdueInvoices.count,
        overdueProjects: _smartData.value?.overdueProjects.length,
        overdueTasks: _smartData.value?.overdueTasks,
        pendingTasks: _smartData.value?.pendingTasks,
        openDeals: _smartData.value?.openDeals.count,
      });
    } catch (err) {
      console.warn('[SmartPrompts] Fetch failed — falling back to static prompts:', err);
    } finally {
      _smartDataLoading.value = false;
    }
  };

  /**
   * Generate prompts from live data.
   * Returns 4 prompts max, prioritized by business importance.
   */
  const getSmartPrompts = (): string[] => {
    const data = _smartData.value;
    if (!data) {
      console.debug('[SmartPrompts] No data available — returning static prompts');
      return getStaticPrompts();
    }

    const prompts: SmartPrompt[] = [];

    // Stale clients — high priority relationship risk
    if (data.staleClients.length > 0) {
      const top = data.staleClients[0];
      const text = tonePrompt('stale_client', {
        name: top.name,
        days: top.daysInactive,
        count: data.staleClients.length,
      });
      prompts.push({ text, priority: 90, category: 'clients' });
    }

    // Overdue invoices — revenue risk
    if (data.overdueInvoices.count > 0) {
      const text = tonePrompt('overdue_invoices', {
        count: data.overdueInvoices.count,
        total: data.overdueInvoices.total,
      });
      prompts.push({ text, priority: 85, category: 'invoices' });
    }

    // Overdue projects
    if (data.overdueProjects.length > 0) {
      const top = data.overdueProjects[0];
      const text = tonePrompt('overdue_project', {
        title: top.title,
        count: data.overdueProjects.length,
      });
      prompts.push({ text, priority: 80, category: 'projects' });
    }

    // Overdue tasks
    if (data.overdueTasks > 0) {
      const text = tonePrompt('overdue_tasks', { count: data.overdueTasks });
      prompts.push({ text, priority: 75, category: 'tasks' });
    }

    // Open deals
    if (data.openDeals.count > 0) {
      const text = tonePrompt('open_deals', {
        count: data.openDeals.count,
        value: data.openDeals.pipelineValue,
      });
      prompts.push({ text, priority: 50, category: 'deals' });
    }

    // Pending tasks (lower priority, always available)
    if (data.pendingTasks > 0) {
      const text = tonePrompt('pending_tasks', { count: data.pendingTasks });
      prompts.push({ text, priority: 30, category: 'tasks' });
    }

    // Sort by priority, take top 4
    prompts.sort((a, b) => b.priority - a.priority);
    const result = prompts.slice(0, 4).map(p => p.text);

    // Pad with static prompts if we have fewer than 4
    if (result.length < 4) {
      const fallbacks = getStaticPrompts();
      for (const fb of fallbacks) {
        if (result.length >= 4) break;
        if (!result.includes(fb)) result.push(fb);
      }
    }

    return result;
  };

  return {
    smartData: _smartData,
    isLoading: _smartDataLoading,
    fetchSmartData,
    getSmartPrompts,
  };
}

/** Prompt templates in Earnest's voice */
function tonePrompt(type: string, data: Record<string, any>): string {
  const templates: Record<string, string> = {
    stale_client: `Follow up with ${data.name} — no activity in ${data.days} days`,
    overdue_invoices: `Review ${data.count} overdue invoice${data.count > 1 ? 's' : ''} — $${(data.total || 0).toLocaleString()} outstanding`,
    overdue_project: `"${data.title}" is overdue — review status and next steps`,
    overdue_tasks: `${data.count} overdue task${data.count > 1 ? 's' : ''} need attention`,
    open_deals: `Review pipeline — ${data.count} open deal${data.count > 1 ? 's' : ''} worth $${(data.value || 0).toLocaleString()}`,
    pending_tasks: `Plan today's priorities from ${data.count} pending tasks`,
  };

  return templates[type] || 'What can I help with?';
}

/** Fallback static prompts when no data is available */
function getStaticPrompts(): string[] {
  return [
    'Give me a business health overview',
    'Help draft a client follow-up email',
    'What should I focus on today?',
    'Summarize my open projects',
  ];
}
