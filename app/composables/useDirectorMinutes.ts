// composables/useDirectorMinutes.ts
/**
 * Thin client wrapper over the director_minutes endpoints — the async
 * "decision room" recap layer of the Director's Office.
 *
 *   record()  — snapshot the finished meeting into a durable decision record
 *               (server generates the AI summary) and return its id.
 *   share()   — fan out a "shared for review" notification to teammates.
 *   load()    — fetch one record for the read-only recap page.
 *   list()    — the org's decision records for the /director history.
 *
 * All persistence is server-side (admin) and degrades gracefully: if the
 * collection isn't set up, record() surfaces a soft toast and returns null.
 */

export interface MinutesStepSnapshot {
  id: string;
  action_type: string;
  title: string;
  preview?: any;
  status: 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
}
export interface MinutesCapturedSnapshot {
  type: 'task' | 'ticket';
  title: string;
  priority?: string;
  assignees?: string[];
}
export interface MinutesQaSnapshot { role: 'user' | 'assistant'; text: string }

export interface RecordMinutesPayload {
  organizationId: string;
  sessionId?: string | number | null;
  title?: string | null;
  scopeType: 'org' | 'entity' | 'mine';
  entityType?: string | null;
  entityId?: string | null;
  subject?: string | null;
  topic?: string | null;
  planId?: string | null;
  intro?: string | null;
  points?: string[] | null;
  finance?: any | null;
  opportunity?: any | null;
  clientRating?: any | null;
  steps?: MinutesStepSnapshot[];
  captured?: MinutesCapturedSnapshot[];
  qa?: MinutesQaSnapshot[];
}

export interface MinutesStats {
  done: number; skipped: number; failed: number; open: number; total: number; captured: number;
}

export interface LoadedMinutes {
  id: string | number;
  organizationId: string | null;
  authorId: string | null;
  authorName: string | null;
  sessionId: string | number | null;
  title: string | null;
  scopeType: 'org' | 'entity' | 'mine';
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  planId: string | null;
  summary: string | null;
  intro: string | null;
  points: string[] | null;
  finance: any | null;
  opportunity: any | null;
  clientRating: any | null;
  steps: MinutesStepSnapshot[];
  captured: MinutesCapturedSnapshot[];
  qa: MinutesQaSnapshot[];
  stats: MinutesStats | null;
  status: 'recorded' | 'shared';
  dateCreated: string | null;
}

export interface MinutesListRow {
  id: string | number;
  title: string | null;
  scopeType: 'org' | 'entity' | 'mine';
  entityType: string | null;
  entityId: string | null;
  subject: string | null;
  topic: string | null;
  summary: string | null;
  authorName: string | null;
  status: 'recorded' | 'shared';
  stats: MinutesStats | null;
  dateCreated: string | null;
}

export function useDirectorMinutes() {
  const toast = useToast();

  /** Snapshot the meeting; returns { id, summary, stats } or null on failure. */
  async function record(payload: RecordMinutesPayload): Promise<{ id: string; summary: string; stats: MinutesStats } | null> {
    try {
      return await $fetch('/api/ai/director/minutes', { method: 'POST', body: payload });
    } catch (err: any) {
      if (err?.statusCode === 503) {
        toast.add({ title: 'Minutes not set up', description: 'The decision-record store needs a one-time admin setup. Nothing was saved.', icon: 'i-lucide-info', color: 'blue' });
      } else {
        toast.add({ title: 'Could not record minutes', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
      }
      return null;
    }
  }

  /** Fan out a "shared for review" notification. Returns the count, or 0. */
  async function share(minutesId: string | number, userIds: string[], note?: string): Promise<number> {
    if (!userIds.length) return 0;
    try {
      const res = await $fetch<{ shared: number }>(`/api/ai/director/minutes/${minutesId}/share`, {
        method: 'POST', body: { userIds, note },
      });
      return res.shared || 0;
    } catch (err: any) {
      toast.add({ title: 'Could not share', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
      return 0;
    }
  }

  async function load(minutesId: string | number): Promise<LoadedMinutes | null> {
    try {
      const res = await $fetch<{ minutes: LoadedMinutes }>(`/api/ai/director/minutes/${minutesId}`);
      return res.minutes;
    } catch {
      return null;
    }
  }

  async function list(organizationId: string, limit = 40): Promise<MinutesListRow[]> {
    try {
      const res = await $fetch<{ minutes: MinutesListRow[] }>('/api/ai/director/minutes', {
        query: { organizationId, limit },
      });
      return res.minutes || [];
    } catch {
      return [];
    }
  }

  return { record, share, load, list };
}
