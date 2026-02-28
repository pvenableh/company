/**
 * Project Timeline System Types
 *
 * Base schema types re-exported from auto-generated directus.ts.
 * App-level types (payloads, resolved relations, UI state, helpers) defined here.
 */

// Re-export base schema types from auto-generated file
export type {
  Project,
  ProjectEvent,
  ProjectTask,
  ProjectTasksWatcher as ProjectTaskWatcher,
  ProjectEventFile,
  ProjectCategory,
  ProjectEventCategory,
} from '../directus';

// Import for use in local type definitions
import type {
  Project,
  ProjectEvent,
  ProjectTask,
  ProjectTasksWatcher,
  ProjectEventFile,
  ProjectCategory,
  ProjectEventCategory,
} from '../directus';

import type { User } from '../system';
import type { File } from '../system';

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
  watchers: (Omit<ProjectTasksWatcher, 'user_id'> & { user_id: User })[];
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
