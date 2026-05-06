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
  const { getReactionSummary } = useReactions();
  const { getCommentCount } = useComments();

  const portalWriteGuard = (): never => {
    throw new Error('Mutations are disabled in portal mode');
  };

  const projectList = useState<ProjectWithRelations[]>('project-timeline', () => []);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const projectFields = [
    '*',
    'category_id.*',
    'parent_id.id',
    'parent_id.title',
    'parent_id.color',
    'parent_event_id.id',
    'parent_event_id.title',
    'user_created.id',
    'user_created.first_name',
    'user_created.last_name',
    'user_created.avatar',
    'service.name',
    'service.color',
    'organization.id',
    'organization.name',
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
    'children.id',
    'children.title',
    'children.color',
    'children.status',
  ];

  /** Existing project statuses considered visible for timeline display */
  const TIMELINE_VISIBLE_STATUSES = ['In Progress', 'completed', 'Scheduled', 'Pending'];

  /** Existing event statuses considered visible for timeline display */
  const EVENT_VISIBLE_STATUSES = ['Active', 'Scheduled', 'Completed'];

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
      const filter: Record<string, any> = {
        _and: [
          { status: { _in: TIMELINE_VISIBLE_STATUSES } },
        ],
      };

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

      const result = await projects.list({
        fields: projectFields,
        filter,
        sort: ['sort', 'start_date'],
        limit: -1,
      });

      for (const project of result as ProjectWithRelations[]) {
        if (project.events) {
          project.events = (project.events as ProjectEventWithRelations[])
            .filter((e) => EVENT_VISIBLE_STATUSES.includes(e.status))
            .sort((a, b) => {
              const dateA = a.event_date || a.date || '';
              const dateB = b.event_date || b.date || '';
              return new Date(dateA).getTime() - new Date(dateB).getTime();
            });

          for (const event of project.events as ProjectEventWithRelations[]) {
            try {
              const [commentCount, reactionSummary] = await Promise.all([
                getCommentCount('project_events', event.id),
                getReactionSummary('project_events', event.id),
              ]);
              event.comment_count = commentCount.total_count;
              event.reaction_count = reactionSummary.totalCount;
            } catch {
              event.comment_count = 0;
              event.reaction_count = 0;
            }
          }
        }

        if (project.children) {
          project.children = (project.children as Project[]).filter((c) =>
            ['In Progress', 'completed'].includes(c.status)
          ) as ProjectWithRelations[];
        }
      }

      projectList.value = result as ProjectWithRelations[];
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch projects';
    } finally {
      loading.value = false;
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

  return {
    projects: projectList,
    loading,
    error,
    refresh: fetchProjects,
    fetchProjects,
    fetchProject,
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
  };
}
