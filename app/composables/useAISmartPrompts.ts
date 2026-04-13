/**
 * Data-driven AI prompt suggestions — replaces static persona prompts with
 * contextual suggestions based on the user's actual business state.
 *
 * Uses data from useAIProductivityEngine metrics + live Directus queries
 * to generate prompts like "Follow up with Acme Corp — no activity in 21 days".
 *
 * Persona controls the tone, not the intelligence — all personas get the same data.
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
      getSmartPrompts: (persona: string) => getStaticPrompts(persona),
    };
  }

  const { selectedOrg } = useOrganization();
  const { selectedClient, getClientFilter } = useClients();
  const { user } = useDirectusAuth();

  const clientItems = useDirectusItems('clients');
  const invoiceItems = useDirectusItems('invoices');
  const projectItems = useDirectusItems('projects');
  const taskItems = useDirectusItems('project_tasks');
  const leadItems = useDirectusItems('leads');

  const orgFilter = () => selectedOrg.value ? { organization: { _eq: selectedOrg.value } } : {};

  /** Fetch live data for prompt generation */
  const fetchSmartData = async () => {
    if (_smartDataLoading.value) return;
    if (_smartData.value && Date.now() < _smartDataExpiry.value) return;

    _smartDataLoading.value = true;
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const [clients, invoices, projects, tasks, leads] = await Promise.all([
        // Stale clients
        clientItems.getItems({
          params: {
            filter: { ...orgFilter(), status: { _eq: 'active' } },
            fields: ['id', 'name', 'date_updated'],
            sort: ['date_updated'],
            limit: 10,
          },
        }).catch(() => []) as Promise<Array<{ id: string; name: string; date_updated: string }>>,

        // Overdue invoices
        invoiceItems.getItems({
          params: {
            filter: {
              ...orgFilter(),
              status: { _in: ['pending', 'processing'] },
              due_date: { _lt: now.toISOString() },
            },
            fields: ['id', 'total_amount'],
            limit: 50,
          },
        }).catch(() => []) as Promise<Array<{ id: string; total_amount: number }>>,

        // Active projects
        projectItems.getItems({
          params: {
            filter: {
              ...orgFilter(),
              status: { _in: ['Pending', 'Scheduled', 'In Progress'] },
            },
            fields: ['id', 'title', 'status', 'due_date'],
            sort: ['due_date'],
            limit: 15,
          },
        }).catch(() => []) as Promise<Array<{ id: string; title: string; status: string; due_date: string }>>,

        // User's tasks
        taskItems.getItems({
          params: {
            filter: { assignee_id: { _eq: user.value?.id } },
            fields: ['id', 'completed', 'due_date'],
            limit: 50,
          },
        }).catch(() => []) as Promise<Array<{ id: string; completed: boolean; due_date: string }>>,

        // Open leads
        leadItems.getItems({
          params: {
            filter: {
              ...orgFilter(),
              status: { _eq: 'published' },
              stage: { _nin: ['won', 'lost'] },
            },
            fields: ['id', 'estimated_value'],
            limit: 20,
          },
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

      const pendingTasks = (tasks || []).filter(t => !t.completed);
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
    } catch {
      // Non-critical — fall back to static prompts
    } finally {
      _smartDataLoading.value = false;
    }
  };

  /**
   * Generate persona-toned prompts from live data.
   * Returns 4 prompts max, prioritized by business importance.
   */
  const getSmartPrompts = (persona: string): string[] => {
    const data = _smartData.value;
    if (!data) return getStaticPrompts(persona);

    const prompts: SmartPrompt[] = [];

    // Stale clients — high priority relationship risk
    if (data.staleClients.length > 0) {
      const top = data.staleClients[0];
      const text = tonePrompt(persona, 'stale_client', {
        name: top.name,
        days: top.daysInactive,
        count: data.staleClients.length,
      });
      prompts.push({ text, priority: 90, category: 'clients' });
    }

    // Overdue invoices — revenue risk
    if (data.overdueInvoices.count > 0) {
      const text = tonePrompt(persona, 'overdue_invoices', {
        count: data.overdueInvoices.count,
        total: data.overdueInvoices.total,
      });
      prompts.push({ text, priority: 85, category: 'invoices' });
    }

    // Overdue projects
    if (data.overdueProjects.length > 0) {
      const top = data.overdueProjects[0];
      const text = tonePrompt(persona, 'overdue_project', {
        title: top.title,
        count: data.overdueProjects.length,
      });
      prompts.push({ text, priority: 80, category: 'projects' });
    }

    // Overdue tasks
    if (data.overdueTasks > 0) {
      const text = tonePrompt(persona, 'overdue_tasks', { count: data.overdueTasks });
      prompts.push({ text, priority: 75, category: 'tasks' });
    }

    // Open deals
    if (data.openDeals.count > 0) {
      const text = tonePrompt(persona, 'open_deals', {
        count: data.openDeals.count,
        value: data.openDeals.pipelineValue,
      });
      prompts.push({ text, priority: 50, category: 'deals' });
    }

    // Pending tasks (lower priority, always available)
    if (data.pendingTasks > 0) {
      const text = tonePrompt(persona, 'pending_tasks', { count: data.pendingTasks });
      prompts.push({ text, priority: 30, category: 'tasks' });
    }

    // Sort by priority, take top 4
    prompts.sort((a, b) => b.priority - a.priority);
    const result = prompts.slice(0, 4).map(p => p.text);

    // Pad with static prompts if we have fewer than 4
    if (result.length < 4) {
      const fallbacks = getStaticPrompts(persona);
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

/** Persona-toned prompt templates */
function tonePrompt(persona: string, type: string, data: Record<string, any>): string {
  const templates: Record<string, Record<string, string>> = {
    stale_client: {
      default: `Follow up with ${data.name} — no activity in ${data.days} days`,
      director: `${data.name} needs attention — ${data.days} days inactive. Action required.`,
      buddy: `Hey, should we check in with ${data.name}? It's been ${data.days} days`,
      motivator: `Great opportunity to reconnect with ${data.name}!`,
    },
    overdue_invoices: {
      default: `Review ${data.count} overdue invoice${data.count > 1 ? 's' : ''} — $${(data.total || 0).toLocaleString()} outstanding`,
      director: `${data.count} overdue invoice${data.count > 1 ? 's' : ''}: $${(data.total || 0).toLocaleString()}. Chase these now.`,
      buddy: `Heads up — ${data.count} invoice${data.count > 1 ? 's' : ''} past due ($${(data.total || 0).toLocaleString()})`,
      motivator: `Let's get that $${(data.total || 0).toLocaleString()} collected — ${data.count} invoice${data.count > 1 ? 's' : ''} waiting!`,
    },
    overdue_project: {
      default: `"${data.title}" is overdue — review status and next steps`,
      director: `Project "${data.title}" is past deadline. What's the blocker?`,
      buddy: `"${data.title}" is running behind — need help getting it unstuck?`,
      motivator: `Let's get "${data.title}" back on track — you've got this!`,
    },
    overdue_tasks: {
      default: `${data.count} overdue task${data.count > 1 ? 's' : ''} need attention`,
      director: `${data.count} task${data.count > 1 ? 's' : ''} overdue. Prioritize and clear the backlog.`,
      buddy: `You've got ${data.count} task${data.count > 1 ? 's' : ''} past due — want help triaging?`,
      motivator: `Let's knock out those ${data.count} overdue task${data.count > 1 ? 's' : ''} — momentum time!`,
    },
    open_deals: {
      default: `Review pipeline — ${data.count} open deal${data.count > 1 ? 's' : ''} worth $${(data.value || 0).toLocaleString()}`,
      director: `Pipeline: ${data.count} deal${data.count > 1 ? 's' : ''}, $${(data.value || 0).toLocaleString()}. What's closest to closing?`,
      buddy: `Your pipeline's looking good — ${data.count} deal${data.count > 1 ? 's' : ''} totaling $${(data.value || 0).toLocaleString()}`,
      motivator: `$${(data.value || 0).toLocaleString()} in your pipeline — let's close some deals! 🔥`,
    },
    pending_tasks: {
      default: `Plan today's priorities from ${data.count} pending tasks`,
      director: `${data.count} tasks pending. Rank by impact and execute.`,
      buddy: `What should we tackle first from your ${data.count} tasks?`,
      motivator: `${data.count} tasks ready for you — let's make progress!`,
    },
  };

  return templates[type]?.[persona] || templates[type]?.default || 'What can I help with?';
}

/** Fallback static prompts when no data is available */
function getStaticPrompts(persona: string): string[] {
  const statics: Record<string, string[]> = {
    default: [
      'Give me a business health overview',
      'Help draft a client follow-up email',
      'What should I focus on today?',
      'Summarize my open projects',
    ],
    director: [
      'What\'s the top priority right now?',
      'Give me a game plan for this week',
      'Which clients need immediate attention?',
      'Revenue status and next actions',
    ],
    buddy: [
      'What\'s going on across the business?',
      'Help me word this email nicely',
      'I\'m overwhelmed — help me prioritize',
      'Any clients I should check in with?',
    ],
    motivator: [
      'Show me what I\'ve accomplished recently',
      'Help me get energized about today\'s work',
      'What wins can we celebrate?',
      'Help me tackle my biggest challenge',
    ],
  };

  return statics[persona] || statics.default;
}
