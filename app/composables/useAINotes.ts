/**
 * AI Notes composable — CRUD operations for saved AI insights with tagging.
 *
 * Provides:
 * - Notes: fetch, create, update, delete, pin, archive
 * - Tags: fetch, create, delete
 * - Save from chat message (via server convenience endpoint)
 * - Filtering by tags and search
 */

import type { AiNote, AiTag } from '~~/shared/directus';

interface NoteListParams {
  page?: number;
  limit?: number;
  status?: 'active' | 'archived';
  search?: string;
  tags?: string[];
  pinned?: boolean;
}

// Module-level shared state (persists across component instances)
const notes = ref<AiNote[]>([]);
const tags = ref<AiTag[]>([]);
const selectedTagIds = ref<string[]>([]);
const searchQuery = ref('');
const isLoading = ref(false);
const activeNote = ref<AiNote | null>(null);
const meta = ref({ page: 1, limit: 25, total: 0, totalPages: 0 });

export function useAINotes() {
  const { selectedOrg } = useOrganization();

  const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || '');

  // Guard: all Directus operations are client-only
  if (import.meta.server) {
    return {
      notes, tags, selectedTagIds, searchQuery, isLoading, activeNote, meta,
      fetchNotes: async () => {}, fetchNote: async () => null,
      saveNoteFromMessage: async () => null, createNote: async () => null,
      updateNote: async () => null, deleteNote: async () => false,
      togglePin: async () => null, archiveNote: async () => null,
      fetchTags: async () => {}, createTag: async () => null, deleteTag: async () => false,
      categoryTags: computed(() => []), entityTags: computed(() => []),
      filteredNotes: computed(() => []),
    };
  }

  // ── Notes CRUD ──

  const fetchNotes = async (params?: NoteListParams) => {
    if (!organizationId.value) return;
    isLoading.value = true;

    try {
      const queryParams: Record<string, any> = {
        organizationId: organizationId.value,
        limit: params?.limit || 25,
        page: params?.page || 1,
        status: params?.status || 'active',
      };

      if (params?.search || searchQuery.value) {
        queryParams.search = params?.search || searchQuery.value;
      }
      if (params?.tags?.length || selectedTagIds.value.length) {
        queryParams.tags = (params?.tags || selectedTagIds.value).join(',');
      }
      if (params?.pinned) {
        queryParams.pinned = 'true';
      }

      const response = await $fetch('/api/ai/notes', { params: queryParams }) as any;
      notes.value = response?.notes || [];
      if (response?.meta) {
        meta.value = response.meta;
      }
    } catch (err: any) {
      console.error('[useAINotes] Failed to fetch notes:', err);
    } finally {
      isLoading.value = false;
    }
  };

  const fetchNote = async (noteId: string) => {
    try {
      const response = await $fetch(`/api/ai/notes/${noteId}`) as any;
      activeNote.value = response?.note || null;
      return activeNote.value;
    } catch (err: any) {
      console.error('[useAINotes] Failed to fetch note:', err);
      return null;
    }
  };

  const saveNoteFromMessage = async (
    sessionId: string,
    messageContent: string,
    messageId: string,
    title?: string,
    tagIds?: string[],
  ) => {
    if (!organizationId.value) return null;

    try {
      const response = await $fetch('/api/ai/notes/from-message', {
        method: 'POST',
        body: {
          sessionId,
          messageContent,
          messageId,
          organizationId: organizationId.value,
          title,
          tagIds,
        },
      }) as any;

      // Refresh notes list
      fetchNotes();
      return response?.note || null;
    } catch (err: any) {
      console.error('[useAINotes] Failed to save note from message:', err);
      return null;
    }
  };

  const createNote = async (data: { title?: string; content: string; tagIds?: string[] }) => {
    if (!organizationId.value) return null;

    try {
      const response = await $fetch('/api/ai/notes', {
        method: 'POST',
        body: {
          ...data,
          organizationId: organizationId.value,
        },
      }) as any;

      fetchNotes();
      return response?.note || null;
    } catch (err: any) {
      console.error('[useAINotes] Failed to create note:', err);
      return null;
    }
  };

  const updateNote = async (noteId: string, data: Record<string, any>) => {
    try {
      const response = await $fetch(`/api/ai/notes/${noteId}`, {
        method: 'PATCH',
        body: data,
      }) as any;

      // Update in local list
      const idx = notes.value.findIndex(n => (n as any).id === noteId);
      if (idx >= 0 && response?.note) {
        notes.value[idx] = { ...notes.value[idx], ...response.note };
      }
      if (activeNote.value && (activeNote.value as any).id === noteId) {
        activeNote.value = { ...activeNote.value, ...response.note };
      }

      return response?.note || null;
    } catch (err: any) {
      console.error('[useAINotes] Failed to update note:', err);
      return null;
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await $fetch(`/api/ai/notes/${noteId}`, { method: 'DELETE' });
      notes.value = notes.value.filter(n => (n as any).id !== noteId);
      if (activeNote.value && (activeNote.value as any).id === noteId) {
        activeNote.value = null;
      }
      return true;
    } catch (err: any) {
      console.error('[useAINotes] Failed to delete note:', err);
      return false;
    }
  };

  const togglePin = async (noteId: string) => {
    const note = notes.value.find(n => (n as any).id === noteId);
    if (!note) return;
    return updateNote(noteId, { is_pinned: !note.is_pinned });
  };

  const archiveNote = async (noteId: string) => {
    return updateNote(noteId, { status: 'archived' });
  };

  // ── Tags CRUD ──

  const fetchTags = async () => {
    if (!organizationId.value) return;

    try {
      const response = await $fetch('/api/ai/tags', {
        params: { organizationId: organizationId.value },
      }) as any;
      tags.value = response?.tags || [];
    } catch (err: any) {
      console.error('[useAINotes] Failed to fetch tags:', err);
    }
  };

  const createTag = async (data: {
    name: string;
    color?: string;
    type?: 'category' | 'entity';
    entity_type?: string;
    entity_id?: string;
  }) => {
    if (!organizationId.value) return null;

    try {
      const response = await $fetch('/api/ai/tags', {
        method: 'POST',
        body: {
          ...data,
          organizationId: organizationId.value,
        },
      }) as any;

      const newTag = response?.tag;
      if (newTag && !response?.existed) {
        tags.value.push(newTag);
      }
      return newTag || null;
    } catch (err: any) {
      console.error('[useAINotes] Failed to create tag:', err);
      return null;
    }
  };

  const deleteTag = async (tagId: string) => {
    try {
      await $fetch(`/api/ai/tags/${tagId}`, { method: 'DELETE' });
      tags.value = tags.value.filter(t => (t as any).id !== tagId);
      return true;
    } catch (err: any) {
      console.error('[useAINotes] Failed to delete tag:', err);
      return false;
    }
  };

  // ── Computed ──

  const filteredNotes = computed(() => {
    let result = notes.value;

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter(n =>
        (n.title?.toLowerCase().includes(q)) ||
        (n.excerpt?.toLowerCase().includes(q)),
      );
    }

    return result;
  });

  const categoryTags = computed(() => tags.value.filter(t => t.type === 'category'));
  const entityTags = computed(() => tags.value.filter(t => t.type === 'entity'));

  return {
    // State
    notes,
    tags,
    selectedTagIds,
    searchQuery,
    isLoading,
    activeNote,
    meta,

    // Notes
    fetchNotes,
    fetchNote,
    saveNoteFromMessage,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    archiveNote,

    // Tags
    fetchTags,
    createTag,
    deleteTag,
    categoryTags,
    entityTags,

    // Computed
    filteredNotes,
  };
}
