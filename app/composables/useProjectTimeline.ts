/**
 * useProjectTimeline - Main composable for project timeline data
 *
 * Uses existing Directus field names: title (not name), due_date (not target_end_date),
 * completion_date (not actual_end_date), project (not project_id), date/event_date.
 */

import type {
  Project,
  ProjectWithRelations,
  ProjectEvent,
  ProjectEventWithRelations,
  ProjectTask,
  CreateProjectPayload,
  CreateEventPayload,
  CreateTaskPayload,
} from '~~/shared/projects';

export function useProjectTimeline(opts: { portal?: boolean } = {}) {
  const { user } = useDirectusAuth();
  const { selectedOrg } = useOrganization();
  const { getClientFilter } = useClients();

  // Portal-only users have no Directus role granting read on
  // projects/project_events/project_tasks. Route reads through the portal
  // proxy (admin token + client_portal_users scope) when `portal: true`.
  // The mutation surface (update/create/remove) only exists on
  // useDirectusItems — calling it in portal mode is a programming error
  // and the corresponding methods below throw with a clear message.
  const projects = opts.portal
    ? (usePortalItems<Project>('projects') as any)
    : useDirectusItems<Project>('projects');
  const events = opts.portal
    ? (usePortalItems<ProjectEvent>('project_events') as any)
    : useDirectusItems<ProjectEvent>('project_events');
  const tasks = opts.portal
    ? (usePortalItems<ProjectTask>('project_tasks') as any)
    : useDirectusItems<ProjectTask>('project_tasks');
  // Aggregate-only handles for batched comment/reaction count rollups.
  // Skipped in portal mode — counts aren't displayed there and the portal
  // proxy doesn't expose `comments` / `reactions` collections.
  const commentItems = opts.portal ? null : useDirectusItems('comments');
  const reactionItems = opts.portal ? null : useDirectusItems('reactions');

  const portalWriteGuard = (): never => {
    throw new Error('Mutations are disabled in portal mode');
  };

  const projectList = useState<ProjectWithRelations[]>('project-timeline', () => []);
  const loading = ref(true);
  const error = ref<string | null>(null);

  // When true, the 90-day date window on completed projects is dropped and
  // every completed project is loaded. Off by default — the toggle UI in
  // the Gantt toolbar flips it and re-fetches.
  const showAllCompleted = useState('project-timeline-all-completed', () => false);

  // Per-project lazy-load state. The shallow list query (below) doesn't
  // walk into events/tasks/files; those arrive via fetchProjectDetails()
  // when the user expands a project row. This map gates the detail fetch
  // so re-expanding a row doesn't re-issue the request.
  type ProjectDetailState = 'idle' | 'loading' | 'loaded';
  const projectDetailState = useState<Record<string, ProjectDetailState>>(
    'project-timeline-detail-state',
    () => ({}),
  );

  // Shallow fields for the list query — just enough for the Gantt to
  // render the project bar, parent/child grouping, and the toolbar
  // metadata. Events/tasks/files are deferred to fetchProjectDetails().
  const projectFields = [
    'id',
    'title',
    'status',
    'color',
    'start_date',
    'due_date',
    'completion_date',
    'sort',
    'service.name',
    'service.color',
    'organization.id',
    'organization.name',
    'parent_id.id',
    'parent_id.title',
    'parent_id.color',
    'parent_event_id.id',
    'parent_event_id.title',
    'user_created.id',
    'user_created.first_name',
    'user_created.last_name',
    'user_created.avatar',
    'category_id.*',
    'children.id',
    'children.title',
    'children.color',
    'children.status',
  ];

  // Detail fields fetched on row expand — events + their tasks + files,
  // matching the nested shape the Gantt + event-detail modal expect.
  const detailFields = [
    'id',
    'events.id',
    'events.status',
    'events.title',
    'events.description',
    'events.date',
    'events.event_date',
    'events.is_milestone',
    'events.type',
    'events.category_id.*',
    'events.tasks.id',
    'events.tasks.title',
    'events.tasks.completed',
    'events.tasks.due_date',
    'events.tasks.priority',
    'events.tasks.assignee_id.id',
    'events.tasks.assignee_id.first_name',
    'events.tasks.assignee_id.last_name',
    'events.tasks.assignee_id.avatar',
    'events.files.id',
    'events.files.directus_files_id.id',
    'events.files.directus_files_id.filename_download',
    'events.files.directus_files_id.type',
    'events.files.directus_files_id.filesize',
  ];

  /** Event statuses considered visible for timeline display (client-side filter) */
  const EVENT_VISIBLE_STATUSES = ['Active', 'Scheduled', 'Completed'];

  /**
   * Date-window for completed projects: include only those finished within
   * the last 90 days. Active states (In Progress / Scheduled / Pending)
   * are always shown regardless of dates.
   */
  const COMPLETED_WINDOW_DAYS = 90;

  const fetchProjects = async () => {
    if (!user.value?.id) {
      loading.value = false;
      return;
    }
    // Portal mode is org-scoped server-side — selectedOrg may not have
    // resolved client-side yet when the Gantt mounts in /portal/projects,
    // so skip the early bail.
    if (!opts.portal && !selectedOrg.value) {
      projectList.value = [];
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const completedSince = new Date(
        Date.now() - COMPLETED_WINDOW_DAYS * 86_400_000,
      ).toISOString();

      // When `showAllCompleted` is on, drop the date window and let every
      // completed project through. Otherwise active states are always in,
      // and `completed` requires a recent completion_date or date_updated.
      const statusBranch = showAllCompleted.value
        ? { status: { _in: ['In Progress', 'Scheduled', 'Pending', 'completed'] } }
        : {
            _or: [
              { status: { _in: ['In Progress', 'Scheduled', 'Pending'] } },
              {
                _and: [
                  { status: { _eq: 'completed' } },
                  {
                    _or: [
                      { completion_date: { _gte: completedSince } },
                      { date_updated: { _gte: completedSince } },
                    ],
                  },
                ],
              },
            ],
          };

      const filter: Record<string, any> = { _and: [statusBranch] };

      // Portal proxy auto-scopes to org + client (parent_client walk),
      // so don't add manual conditions there — they'd just AND with the
      // proxy filter.
      if (!opts.portal) {
        filter._and.push({ organization: { _eq: selectedOrg.value } });
        const clientFilter = getClientFilter();
        if (Object.keys(clientFilter).length > 0) {
          filter._and.push(clientFilter);
        }
      }

      const result = (await projects.list({
        fields: projectFields,
        filter,
        sort: ['sort', 'start_date'],
        limit: -1,
      })) as ProjectWithRelations[];

      // Preserve previously-loaded events for projects still present, so
      // expanded rows don't flash empty across a shallow re-fetch (e.g.
      // after a mutation). The detail re-fetch below replaces them with
      // fresh data in the background.
      const prevById = new Map(projectList.value.map((p) => [p.id, p]));
      const previouslyLoadedIds: string[] = [];
      for (const project of result) {
        const prev = prevById.get(project.id);
        if (prev && projectDetailState.value[project.id] === 'loaded') {
          project.events = prev.events;
          previouslyLoadedIds.push(project.id);
        }
        if (project.children) {
          project.children = (project.children as Project[]).filter((c) =>
            ['In Progress', 'completed'].includes(c.status ?? ''),
          ) as ProjectWithRelations[];
        }
      }

      // Drop detail-state entries for projects that fell out of the list
      // so the map doesn't grow unbounded across org/client switches.
      const stillPresent = new Set(result.map((p) => p.id));
      for (const id of Object.keys(projectDetailState.value)) {
        if (!stillPresent.has(id)) delete projectDetailState.value[id];
      }

      projectList.value = result;

      // Re-fetch detail for projects that were already expanded so their
      // events stay in sync with the server. Reset to 'idle' first so
      // fetchProjectDetails actually re-runs (it short-circuits on
      // 'loading'/'loaded').
      for (const id of previouslyLoadedIds) {
        projectDetailState.value[id] = 'idle';
      }
      // Fire-and-forget — the shallow list resolve shouldn't block on
      // refreshing nested detail.
      void Promise.all(previouslyLoadedIds.map((id) => fetchProjectDetails(id)));
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch projects';
    } finally {
      loading.value = false;
    }
  };

  /**
   * Lazy-load a single project's events/tasks/files plus comment + reaction
   * counts. Idempotent: short-circuits if the project is currently loading
   * or already loaded. The Gantt calls this when a project row is expanded.
   */
  const fetchProjectDetails = async (projectId: string): Promise<void> => {
    const state = projectDetailState.value[projectId];
    if (state === 'loading' || state === 'loaded') return;

    projectDetailState.value[projectId] = 'loading';

    try {
      const detail = (await projects.get(projectId, {
        fields: detailFields,
      })) as ProjectWithRelations;

      const rawEvents = (detail?.events || []) as ProjectEventWithRelations[];
      const visibleEvents = rawEvents
        .filter((e) => EVENT_VISIBLE_STATUSES.includes(e.status ?? ''))
        .sort((a, b) => {
          const dateA = a.event_date || a.date || '';
          const dateB = b.event_date || b.date || '';
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });

      // Comment + reaction count rollup, scoped to this project's visible
      // events. Skipped in portal mode (the proxy doesn't expose those
      // collections and counts aren't displayed there).
      const visibleEventIds = visibleEvents.map((e) => e.id);
      const commentCountByEvent = new Map<string, number>();
      const reactionCountByEvent = new Map<string, number>();

      if (visibleEventIds.length > 0 && commentItems && reactionItems) {
        const [commentRows, reactionRows] = await Promise.all([
          commentItems
            .aggregate({
              aggregate: { count: ['id'] },
              groupBy: ['item'],
              filter: {
                collection: { _eq: 'project_events' },
                item: { _in: visibleEventIds },
              },
            })
            .catch(() => [] as any[]),
          reactionItems
            .aggregate({
              aggregate: { count: ['id'] },
              groupBy: ['item'],
              filter: {
                table: { _eq: 'project_events' },
                item: { _in: visibleEventIds },
              },
            })
            .catch(() => [] as any[]),
        ]);

        for (const row of (commentRows as any[]) || []) {
          commentCountByEvent.set(row.item, parseInt(row.count?.id ?? row.count ?? 0));
        }
        for (const row of (reactionRows as any[]) || []) {
          reactionCountByEvent.set(row.item, parseInt(row.count?.id ?? row.count ?? 0));
        }
      }

      for (const event of visibleEvents) {
        event.comment_count = commentCountByEvent.get(event.id) ?? 0;
        event.reaction_count = reactionCountByEvent.get(event.id) ?? 0;
      }

      // Merge into the matching projectList entry. If the project is no
      // longer in the list (org switch mid-flight, etc.) just drop the
      // result silently.
      const idx = projectList.value.findIndex((p) => p.id === projectId);
      const target = idx !== -1 ? projectList.value[idx] : undefined;
      if (target) {
        target.events = visibleEvents;
        projectList.value = [...projectList.value];
      }

      projectDetailState.value[projectId] = 'loaded';
    } catch {
      // Reset to idle on failure so the next expand can retry.
      projectDetailState.value[projectId] = 'idle';
    }
  };

  const fetchProject = async (projectId: string): Promise<ProjectWithRelations | null> => {
    if (!user.value?.id) return null;
    try {
      const result = await projects.get(projectId, { fields: projectFields });
      return result as ProjectWithRelations;
    } catch {
      return null;
    }
  };

  const createProject = async (data: CreateProjectPayload): Promise<ProjectWithRelations> => {
    if (opts.portal) portalWriteGuard();
    const created = await projects.create(data as Partial<Project>, { fields: projectFields });
    await fetchProjects();
    return created as ProjectWithRelations;
  };

  const updateProject = async (projectId: string, data: Partial<Project>): Promise<ProjectWithRelations> => {
    if (opts.portal) portalWriteGuard();
    const updated = await projects.update(projectId, data, { fields: projectFields });
    await fetchProjects();
    return updated as ProjectWithRelations;
  };

  const createEvent = async (data: CreateEventPayload): Promise<ProjectEventWithRelations> => {
    if (opts.portal) portalWriteGuard();
    const payload: Partial<ProjectEvent> = {
      ...data,
      status: 'Active',
      date: data.event_date,
    };
    const created = await events.create(payload);
    await fetchProjects();
    return created as ProjectEventWithRelations;
  };

  const updateEvent = async (eventId: string, data: Partial<ProjectEvent>): Promise<ProjectEventWithRelations> => {
    if (opts.portal) portalWriteGuard();
    const updated = await events.update(eventId, data);
    await fetchProjects();
    return updated as ProjectEventWithRelations;
  };

  const deleteEvent = async (eventId: string): Promise<void> => {
    if (opts.portal) portalWriteGuard();
    await events.remove(eventId);
    await fetchProjects();
  };

  const toggleTask = async (taskId: string, completed: boolean): Promise<void> => {
    if (opts.portal) portalWriteGuard();
    await tasks.update(taskId, {
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? user.value?.id : null,
    } as Partial<ProjectTask>);
    await fetchProjects();
  };

  const createTask = async (data: CreateTaskPayload): Promise<ProjectTask> => {
    if (opts.portal) portalWriteGuard();
    const created = await tasks.create(data as Partial<ProjectTask>);
    await fetchProjects();
    return created;
  };

  const updateTask = async (taskId: string, data: Partial<ProjectTask>): Promise<ProjectTask> => {
    if (opts.portal) portalWriteGuard();
    const updated = await tasks.update(taskId, data);
    await fetchProjects();
    return updated;
  };

  const deleteTask = async (taskId: string): Promise<void> => {
    if (opts.portal) portalWriteGuard();
    await tasks.remove(taskId);
    await fetchProjects();
  };

  const createSubProject = async (
    parentProjectId: string,
    parentEventId: string,
    data: Omit<CreateProjectPayload, 'parent_id' | 'parent_event_id'>
  ): Promise<ProjectWithRelations> => {
    return await createProject({
      ...data,
      parent_id: parentProjectId,
      parent_event_id: parentEventId,
    });
  };

  const getProjectById = (projectId: string): ProjectWithRelations | null => {
    return projectList.value.find((p) => p.id === projectId) || null;
  };

  const getEventById = (eventId: string): ProjectEventWithRelations | null => {
    for (const project of projectList.value) {
      const event = project.events?.find((e) => e.id === eventId);
      if (event) return event as ProjectEventWithRelations;
    }
    return null;
  };

  const getProjectForEvent = (eventId: string): ProjectWithRelations | null => {
    for (const project of projectList.value) {
      if (project.events?.find((e) => e.id === eventId)) return project;
    }
    return null;
  };

  const toggleShowAllCompleted = async () => {
    showAllCompleted.value = !showAllCompleted.value;
    await fetchProjects();
  };

  return {
    projects: projectList,
    loading,
    error,
    refresh: fetchProjects,
    fetchProjects,
    fetchProject,
    fetchProjectDetails,
    projectDetailState,
    createProject,
    updateProject,
    createEvent,
    updateEvent,
    deleteEvent,
    createTask,
    updateTask,
    deleteTask,
    toggleTask,
    createSubProject,
    getProjectById,
    getEventById,
    getProjectForEvent,
    showAllCompleted,
    toggleShowAllCompleted,
  };
}
