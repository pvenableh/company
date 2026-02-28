/**
 * Project Timeline System Types
 *
 * Maps to the existing Directus `projects` and `project_events` collections
 * with new fields added for the timeline system. Uses existing field names
 * (title, due_date, completion_date, date) so the Board view keeps working.
 */

import type { User } from '../system';
import type { File } from '../system';

/**
 * Maps to the existing `projects` collection.
 * Existing fields preserved; new fields: color, icon, category_id, parent_id,
 * parent_event_id, member_visible.
 */
export interface Project {
  id: string;
  status: 'Pending' | 'Scheduled' | 'In Progress' | 'completed' | 'Archived';
  sort: number | null;
  user_created: string | User | null;
  user_updated: string | User | null;
  date_created: string | null;
  date_updated: string | null;
  title: string | null;
  description: string | null;
  color: string | null;
  icon: string | null;
  category_id: string | ProjectCategory | null;
  parent_id: string | Project | null;
  parent_event_id: string | ProjectEvent | null;
  member_visible: boolean | null;
  start_date: string | null;
  due_date: string | null;
  completion_date: string | null;
  projected_date: string | null;
  service: any | null;
  organization: any | null;
  team: any | null;
  template: string | null;
  contract_value: number | null;
  url: string | null;
  tags: string[] | null;
  events?: ProjectEvent[];
  children?: Project[];
  tickets?: any[];
  assigned_to?: any[];
}

export interface ProjectCategory {
  id: string;
  status: 'published' | 'draft';
  sort: number | null;
  name: string;
  color: string;
  icon: string | null;
}

export interface ProjectEventCategory {
  id: string;
  status: 'published' | 'draft';
  sort: number | null;
  name: string;
  color: string;
  text_color: string;
  icon: string | null;
}

/**
 * Maps to the existing `project_events` collection.
 * Existing fields preserved; new fields: event_date, is_milestone, category_id.
 */
export interface ProjectEvent {
  id: string;
  status: 'draft' | 'Scheduled' | 'Active' | 'Completed' | 'archived';
  sort: number | null;
  user_created: string | User | null;
  user_updated: string | User | null;
  date_created: string | null;
  date_updated: string | null;
  project: string | Project | null;
  title: string | null;
  description: string | null;
  /** Existing date field */
  date: string | null;
  /** New: explicit timeline date (prefers this, falls back to `date`) */
  event_date: string | null;
  category_id: string | ProjectEventCategory | null;
  is_milestone: boolean | null;
  type: string | null;
  approval: string | null;
  priority: string | null;
  hours: string | null;
  payment_amount: string | null;
  paid: boolean | null;
  link: string | null;
  file: any | null;
  amount: number | null;
  prototype_link: string | null;
  content: string | null;
  tasks?: ProjectTask[];
  files?: ProjectEventFile[];
  comments?: any[];
  spawned_projects?: Project[];
}

export interface ProjectTask {
  id: string;
  status: 'published' | 'draft';
  sort: number | null;
  user_created: string | User | null;
  date_created: string | null;
  event_id: string | ProjectEvent;
  title: string;
  description: string | null;
  assignee_id: string | User | null;
  watchers?: ProjectTaskWatcher[];
  completed: boolean;
  completed_at: string | null;
  completed_by: string | User | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high' | null;
}

export interface ProjectTaskWatcher {
  id: number;
  task_id: string | ProjectTask;
  user_id: string | User;
  date_created: string | null;
}

export interface ProjectEventFile {
  id: number;
  project_event_id: string | ProjectEvent;
  directus_files_id: string | File;
  sort: number | null;
}

export interface ProjectStats {
  events: number;
  tasksTotal: number;
  tasksCompleted: number;
  subProjects: number;
  files: number;
  comments: number;
  reactions: number;
  durationDays: number;
  progressPercent: number;
  isOngoing: boolean;
}

export interface CreateProjectPayload {
  title: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  category_id?: string | null;
  parent_id?: string | null;
  parent_event_id?: string | null;
  member_visible?: boolean;
  start_date: string;
  due_date?: string | null;
  status?: Project['status'];
}

export interface CreateEventPayload {
  project: string;
  title: string;
  description?: string | null;
  event_date: string;
  date?: string;
  category_id?: string | null;
  is_milestone?: boolean;
}

export interface CreateTaskPayload {
  event_id: string;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  due_date?: string | null;
  priority?: ProjectTask['priority'];
}

export interface ProjectWithRelations extends Omit<Project, 'user_created' | 'user_updated' | 'category_id' | 'parent_id' | 'parent_event_id'> {
  user_created: User | null;
  user_updated: User | null;
  category_id: ProjectCategory | null;
  parent_id: Project | null;
  parent_event_id: ProjectEvent | null;
  events: ProjectEventWithRelations[];
  children: ProjectWithRelations[];
}

export interface ProjectEventWithRelations extends Omit<ProjectEvent, 'user_created' | 'project' | 'category_id'> {
  user_created: User | null;
  project: Project;
  category_id: ProjectEventCategory | null;
  tasks: ProjectTaskWithRelations[];
  files: (Omit<ProjectEventFile, 'directus_files_id'> & { directus_files_id: File })[];
  comment_count?: number;
  reaction_count?: number;
}

export interface ProjectTaskWithRelations extends Omit<ProjectTask, 'assignee_id' | 'completed_by' | 'event_id' | 'watchers'> {
  assignee_id: User | null;
  completed_by: User | null;
  event_id: ProjectEvent;
  watchers: (Omit<ProjectTaskWatcher, 'user_id'> & { user_id: User })[];
}

export interface TimelineViewState {
  zoomLevel: number;
  focusedProjectId: string | null;
  selectedEventId: string | null;
  dateRange: { start: Date; end: Date };
}

export interface TimelineLane {
  project: ProjectWithRelations;
  laneIndex: number;
  yPosition: number;
}

/** Get the effective timeline date for an event (prefers event_date, falls back to date) */
export function getEventTimelineDate(event: ProjectEvent | ProjectEventWithRelations): string {
  return event.event_date || event.date || '';
}
