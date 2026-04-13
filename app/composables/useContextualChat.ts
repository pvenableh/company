/**
 * Contextual AI Chat — per-entity scoped chat sessions.
 *
 * Each entity (client:abc, project:xyz) gets its own persistent session
 * with separate message history. Used by the ContextualSidebar component.
 *
 * Sessions are persisted server-side in Directus (ai_chat_sessions + ai_chat_messages).
 * On sidebar open, the most recent session for the entity is loaded automatically.
 */

interface ContextualMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  date_created: string;
}

interface EntityChat {
  sessionId: string | null;
  messages: ContextualMessage[];
  hydrated: boolean; // whether we've attempted to load from server
}

// Module-level shared state — persists across sidebar open/close
const entityChats = reactive(new Map<string, EntityChat>());
const activeEntityKey = ref<string | null>(null);
const isSending = ref(false);
const isStreaming = ref(false);
const isLoadingHistory = ref(false);
const streamingContent = ref('');
const error = ref<string | null>(null);
let abortController: AbortController | null = null;

function getEntityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function getOrCreateChat(key: string): EntityChat {
  if (!entityChats.has(key)) {
    entityChats.set(key, { sessionId: null, messages: [], hydrated: false });
  }
  return entityChats.get(key)!;
}

export function useContextualChat() {
  if (import.meta.server) {
    return {
      messages: computed(() => [] as ContextualMessage[]),
      sessionId: computed(() => null as string | null),
      hasHistory: computed(() => false),
      isSending: ref(false),
      isStreaming: ref(false),
      isLoadingHistory: ref(false),
      streamingContent: ref(''),
      error: ref<string | null>(null),
      setEntity: (_type: string, _id: string) => {},
      sendMessage: async (_content: string) => {},
      cancelStream: () => {},
      clearChat: () => {},
    };
  }

  const { selectedPersona } = useAIPersona();
  const { selectedOrg } = useOrganization();

  const messages = computed(() => {
    if (!activeEntityKey.value) return [];
    return getOrCreateChat(activeEntityKey.value).messages;
  });

  const sessionId = computed(() => {
    if (!activeEntityKey.value) return null;
    return getOrCreateChat(activeEntityKey.value).sessionId;
  });

  const hasHistory = computed(() => {
    if (!activeEntityKey.value) return false;
    return getOrCreateChat(activeEntityKey.value).messages.length > 0;
  });

  /** Load the most recent session for this entity from the server. */
  const hydrateFromServer = async (entityType: string, entityId: string, chat: EntityChat) => {
    if (chat.hydrated) return; // already loaded or attempted
    chat.hydrated = true;

    try {
      isLoadingHistory.value = true;
      const data = await $fetch('/api/ai/sessions/by-entity', {
        params: { entityType, entityId },
      }) as any;

      if (data?.session && data.messages?.length) {
        chat.sessionId = data.session.id;
        chat.messages = data.messages.map((m: any) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          date_created: m.date_created,
        }));
      }
    } catch (e: any) {
      console.error('[ContextualChat] Failed to hydrate session:', e.message);
    } finally {
      isLoadingHistory.value = false;
    }
  };

  const setEntity = (entityType: string, entityId: string) => {
    activeEntityKey.value = getEntityKey(entityType, entityId);
    // Cancel any in-progress stream when switching entities
    if (isStreaming.value) {
      abortController?.abort();
    }
    // Hydrate from server if not yet loaded
    const chat = getOrCreateChat(activeEntityKey.value);
    hydrateFromServer(entityType, entityId, chat);
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isSending.value || !activeEntityKey.value) return;

    const key = activeEntityKey.value;
    const chat = getOrCreateChat(key);
    const [entityType, entityId] = key.split(':');

    isSending.value = true;
    isStreaming.value = true;
    streamingContent.value = '';
    error.value = null;

    const userMsg: ContextualMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      date_created: new Date().toISOString(),
    };
    chat.messages.push(userMsg);

    try {
      abortController = new AbortController();
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          sessionId: chat.sessionId || undefined,
          message: content.trim(),
          organizationId: (selectedOrg.value as any)?.id || undefined,
          responseStyle: selectedPersona.value !== 'default' ? selectedPersona.value : undefined,
          verbosity: useAIPreferences().responseVerbosity.value,
          entityType,
          entityId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'chunk') {
              streamingContent.value += data.content;
            } else if (data.type === 'done') {
              if (data.sessionId) {
                chat.sessionId = data.sessionId;
              }
              chat.messages.push({
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: data.content,
                date_created: new Date().toISOString(),
              });
              streamingContent.value = '';
            } else if (data.type === 'error') {
              error.value = data.error;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('[ContextualChat] Stream error:', e);
        error.value = e.message || 'Failed to get AI response';
        // Remove optimistic user message on error
        const idx = chat.messages.indexOf(userMsg);
        if (idx !== -1) chat.messages.splice(idx, 1);
      }
    } finally {
      isSending.value = false;
      isStreaming.value = false;
      streamingContent.value = '';
      abortController = null;
    }
  };

  const cancelStream = () => {
    abortController?.abort();
  };

  const clearChat = () => {
    if (!activeEntityKey.value) return;
    abortController?.abort();
    const chat = getOrCreateChat(activeEntityKey.value);
    chat.messages.length = 0;
    chat.sessionId = null;
    chat.hydrated = false;
    streamingContent.value = '';
    error.value = null;
  };

  return {
    messages,
    sessionId,
    hasHistory,
    isSending,
    isStreaming,
    isLoadingHistory,
    streamingContent,
    error,
    setEntity,
    sendMessage,
    cancelStream,
    clearChat,
  };
}
