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

export function useProjectTimeline() {
  const { user } = useDirectusAuth();
  const { selectedOrg } = useOrganization();
  const { getClientFilter } = useClients();
  const projects = useDirectusItems<Project>('projects');
  const events = useDirectusItems<ProjectEvent>('project_events');
  const tasks = useDirectusItems<ProjectTask>('project_tasks');
  const { getReactionSummary } = useReactions();
  const { getCommentCount } = useComments();

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
    if (!selectedOrg.value) {
      projectList.value = [];
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const filter: Record<string, any> = {
        _and: [
          { organization: { _eq: selectedOrg.value } },
          { status: { _in: TIMELINE_VISIBLE_STATUSES } },
        ],
      };

      const clientFilter = getClientFilter();
      if (Object.keys(clientFilter).length > 0) {
        filter._and.push(clientFilter);
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
    const created = await projects.create(data as Partial<Project>, { fields: projectFields });
    await fetchProjects();
    return created as ProjectWithRelations;
  };

  const updateProject = async (projectId: string, data: Partial<Project>): Promise<ProjectWithRelations> => {
    const updated = await projects.update(projectId, data, { fields: projectFields });
    await fetchProjects();
    return updated as ProjectWithRelations;
  };

  const createEvent = async (data: CreateEventPayload): Promise<ProjectEventWithRelations> => {
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
    const updated = await events.update(eventId, data);
    await fetchProjects();
    return updated as ProjectEventWithRelations;
  };

  const deleteEvent = async (eventId: string): Promise<void> => {
    await events.remove(eventId);
    await fetchProjects();
  };

  const toggleTask = async (taskId: string, completed: boolean): Promise<void> => {
    await tasks.update(taskId, {
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? user.value?.id : null,
    } as Partial<ProjectTask>);
    await fetchProjects();
  };

  const createTask = async (data: CreateTaskPayload): Promise<ProjectTask> => {
    const created = await tasks.create(data as Partial<ProjectTask>);
    await fetchProjects();
    return created;
  };

  const updateTask = async (taskId: string, data: Partial<ProjectTask>): Promise<ProjectTask> => {
    const updated = await tasks.update(taskId, data);
    await fetchProjects();
    return updated;
  };

  const deleteTask = async (taskId: string): Promise<void> => {
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
