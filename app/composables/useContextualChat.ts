/**
 * Contextual AI Chat — per-entity scoped chat sessions.
 *
 * Each entity (client:abc, project:xyz) gets its own persistent session
 * with separate message history. Used by the ContextualSidebar component.
 *
 * Sessions are persisted server-side in Directus (ai_chat_sessions + ai_chat_messages).
 * On sidebar open, the most recent session for the entity is loaded automatically.
 */
import { getLiveTranscriptFor } from '~/composables/useLiveMeetingTranscript';

interface ContextualMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  date_created: string;
  /** Stable id for v-for keys so the same DOM node is reused across the
   * streaming → persisted transition. */
  key: string;
  /** Server-side persisted message id (set after `done` event arrives or
   * when the message comes from hydration). The bookmark feature uses this
   * because `id` may still be a local temp value while streaming. */
  serverId?: string;
  /** True while the assistant message is actively receiving streamed chunks. */
  streaming?: boolean;
  feedback?: { rating?: 'positive' | 'negative'; correction?: string };
}

/**
 * What this chat is scoped to. Entity chats target a specific record (and can
 * mutate it via tools); route chats are general per-scope threads (goals,
 * work, dashboard, …) keyed by the page's awareness scope.
 */
type ChatCtx =
  | { kind: 'entity'; entityType: string; entityId: string }
  | { kind: 'route'; scope: string; routeKey: string };

interface EntityChat {
  sessionId: string | null;
  messages: ContextualMessage[];
  hydrated: boolean; // whether we've attempted to load from server
  savedMessageIds: Set<string>; // message ids that have already been saved as ai_notes
  ctx?: ChatCtx;
}

/** Extra per-send context the panel derives from useEarnestAwareness. */
export interface SendOpts {
  /** Human "right now you're looking at …" sentence injected into the prompt. */
  routeFocus?: string;
  /** Coarse scope ('work' | 'goals' | 'client' | …) for tone + persistence. */
  scope?: string;
  /** Knowledge keys the user kept toggled on ('user' | 'organization' | 'entity'). */
  includedContext?: string[];
}

export interface ToolCallState {
  name: string;
  label: string;
  summary?: string;
  success?: boolean;
}

// Module-level shared state — persists across sidebar open/close
const entityChats = reactive(new Map<string, EntityChat>());
const activeEntityKey = ref<string | null>(null);
const isSending = ref(false);
const isStreaming = ref(false);
const isLoadingHistory = ref(false);
const streamingContent = ref('');
const error = ref<string | null>(null);
const activeToolCall = ref<ToolCallState | null>(null);
// Bumped each time a mutation tool returns success — pages watch this to
// know when to refetch their entity data.
const mutationSignal = ref(0);
const lastMutation = ref<{ tool: string; data?: Record<string, any> } | null>(null);
let abortController: AbortController | null = null;

const TOOL_LABELS: Record<string, string> = {
  reschedule_project: 'Rescheduling project...',
  update_field: 'Updating...',
  add_task: 'Creating task...',
};

function getEntityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function getOrCreateChat(key: string): EntityChat {
  if (!entityChats.has(key)) {
    entityChats.set(key, { sessionId: null, messages: [], hydrated: false, savedMessageIds: new Set() });
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
      activeToolCall: ref<ToolCallState | null>(null),
      mutationSignal: ref(0),
      lastMutation: ref<{ tool: string; data?: Record<string, any> } | null>(null),
      savedMessageIds: computed(() => new Set<string>()),
      markMessageSaved: (_id: string) => {},
      unmarkMessageSaved: (_id: string) => {},
      error: ref<string | null>(null),
      setEntity: (_type: string, _id: string) => {},
      setRoute: (_scope: string, _routeKey: string) => {},
      sendMessage: async (_content: string, _opts?: SendOpts) => {},
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

  const savedMessageIds = computed(() => {
    if (!activeEntityKey.value) return new Set<string>();
    return getOrCreateChat(activeEntityKey.value).savedMessageIds;
  });

  const markMessageSaved = (messageId: string) => {
    if (!activeEntityKey.value) return;
    const chat = getOrCreateChat(activeEntityKey.value);
    // Recreate the Set so reactivity fires (Vue tracks Set membership but
    // a plain `.add` on a Set held in a Map can miss in some setups).
    chat.savedMessageIds = new Set(chat.savedMessageIds);
    chat.savedMessageIds.add(messageId);
  };

  const unmarkMessageSaved = (messageId: string) => {
    if (!activeEntityKey.value) return;
    const chat = getOrCreateChat(activeEntityKey.value);
    chat.savedMessageIds = new Set(chat.savedMessageIds);
    chat.savedMessageIds.delete(messageId);
  };

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
        chat.messages = data.messages.map((m: any) => {
          const id = String(m.id);
          return {
            id,
            serverId: id,
            key: id,
            role: m.role,
            content: m.content,
            date_created: m.date_created,
          };
        });
        if (Array.isArray(data.savedMessageIds)) {
          chat.savedMessageIds = new Set<string>(data.savedMessageIds.map((id: any) => String(id)));
        }
      }
    } catch (e: any) {
      console.error('[ContextualChat] Failed to hydrate session:', e.message);
    } finally {
      isLoadingHistory.value = false;
    }
  };

  /** Load the most recent route-scoped session (general / per-scope thread). */
  const hydrateFromRoute = async (scope: string, routeKey: string, chat: EntityChat) => {
    if (chat.hydrated) return;
    chat.hydrated = true;
    try {
      isLoadingHistory.value = true;
      const data = await $fetch('/api/ai/sessions/by-route', {
        params: { scope, routeKey },
      }) as any;
      if (data?.session && data.messages?.length) {
        chat.sessionId = data.session.id;
        chat.messages = data.messages.map((m: any) => {
          const id = String(m.id);
          return { id, serverId: id, key: id, role: m.role, content: m.content, date_created: m.date_created };
        });
        if (Array.isArray(data.savedMessageIds)) {
          chat.savedMessageIds = new Set<string>(data.savedMessageIds.map((id: any) => String(id)));
        }
      }
    } catch (e: any) {
      console.error('[ContextualChat] Failed to hydrate route session:', e.message);
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
    chat.ctx = { kind: 'entity', entityType, entityId };
    hydrateFromServer(entityType, entityId, chat);
  };

  const setRoute = (scope: string, routeKey: string) => {
    activeEntityKey.value = `route:${routeKey}`;
    if (isStreaming.value) {
      abortController?.abort();
    }
    const chat = getOrCreateChat(activeEntityKey.value);
    chat.ctx = { kind: 'route', scope, routeKey };
    hydrateFromRoute(scope, routeKey, chat);
  };

  const sendMessage = async (content: string, opts: SendOpts = {}) => {
    if (!content.trim() || isSending.value || !activeEntityKey.value) return;

    const key = activeEntityKey.value;
    const chat = getOrCreateChat(key);
    // Derive scope from the stored ctx (route or entity); the key-split is no
    // longer safe now that route keys contain extra segments.
    const ctx = chat.ctx;
    const entityType = ctx?.kind === 'entity' ? ctx.entityType : '';
    const entityId = ctx?.kind === 'entity' ? ctx.entityId : '';

    isSending.value = true;
    isStreaming.value = true;
    streamingContent.value = '';
    activeToolCall.value = null;
    error.value = null;

    const stamp = Date.now();
    const userMsg: ContextualMessage = {
      id: `user-${stamp}`,
      key: `user-${stamp}`,
      role: 'user',
      content: content.trim(),
      date_created: new Date().toISOString(),
    };
    // Pre-stage an empty assistant bubble so the streamed text grows in
    // place inside the message list (instead of swapping a separate
    // streaming preview node for the persisted message at the end).
    const assistantMsg: ContextualMessage = {
      id: `assistant-${stamp}`,
      key: `assistant-${stamp}`,
      role: 'assistant',
      content: '',
      date_created: new Date().toISOString(),
      streaming: true,
    };
    chat.messages.push(userMsg, assistantMsg);

    // Live meeting transcript: when the focused entity is an in-flight
    // video meeting, the Directus row's `transcript_text` is still empty
    // (Daily only delivers VTT via webhook AFTER the meeting ends). We
    // pull the in-page buffer the meeting view has been pushing to and
    // forward it as `liveTranscript` so the model can answer "what was
    // just said?" mid-call instead of "nothing captured yet".
    const liveTranscript = entityType === 'video_meeting'
      ? getLiveTranscriptFor(entityId)
      : '';

    try {
      abortController = new AbortController();
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          sessionId: chat.sessionId || undefined,
          message: content.trim(),
          organizationId: typeof selectedOrg.value === 'string' ? selectedOrg.value : (selectedOrg.value as any)?.id || undefined,
          responseStyle: selectedPersona.value !== 'default' ? selectedPersona.value : undefined,
          verbosity: useAIPreferences().responseVerbosity.value,
          // Entity scope: only for entity chats (enables mutation tools + entity context).
          entityType: entityType || undefined,
          entityId: entityId || undefined,
          allowMutations: ctx?.kind === 'entity',
          liveTranscript: liveTranscript || undefined,
          // Route scope: general per-scope thread persistence.
          routeScope: ctx?.kind === 'route' ? ctx.scope : undefined,
          routeKey: ctx?.kind === 'route' ? ctx.routeKey : undefined,
          // Awareness: the human focus sentence + the knowledge the user kept on.
          scope: opts.scope,
          routeFocus: opts.routeFocus,
          includedContext: opts.includedContext,
        }),
      });

      if (!response.ok) {
        // Surface the real error reason (e.g. token cap hit) instead of a
        // bare status code. 402 (tokens exhausted) and 403 (non-staff)
        // open the sell-sheet/token modal instead of just toasting so the
        // user has a clear path to the upgrade flow.
        let message = response.statusText || 'Request failed';
        let errorData: any = null;
        try {
          const body = await response.json();
          errorData = body?.data || null;
          message = errorData?.message || body?.message || body?.statusMessage || message;
        } catch {}

        if (response.status === 402 || (response.status === 403 && errorData?.sellSheet)) {
          // Both routes share the same modal — it's the existing
          // OrganizationTokenManagementModal mounted globally in the default
          // layout. The modal copy already covers both "no tokens" and
          // "upgrade for AI" states.
          const { openTokenModal } = await import('~/composables/useTokenModal');
          openTokenModal();
        } else if (response.status === 429) {
          const { toast } = await import('vue-sonner');
          toast.error(message);
        }
        throw new Error(message);
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
              assistantMsg.content += data.content;
              streamingContent.value = assistantMsg.content;
            } else if (data.type === 'tool_start') {
              activeToolCall.value = {
                name: data.tool,
                label: TOOL_LABELS[data.tool] || 'Working...',
              };
            } else if (data.type === 'tool_done') {
              activeToolCall.value = {
                name: data.tool,
                label: TOOL_LABELS[data.tool]?.replace('...', '') || 'Done',
                summary: data.summary,
                success: data.success,
              };
              if (data.success) {
                lastMutation.value = { tool: data.tool, data: data.data };
                mutationSignal.value++;
              }
            } else if (data.type === 'done') {
              if (data.sessionId) {
                chat.sessionId = data.sessionId;
              }
              // Backfill final content (covers the tool-aware path where the
              // server sends a single chunk + done) and flip streaming off.
              if (data.content && !assistantMsg.content) {
                assistantMsg.content = data.content;
              }
              if (data.assistantMessageId) {
                assistantMsg.serverId = String(data.assistantMessageId);
                assistantMsg.id = String(data.assistantMessageId);
              }
              assistantMsg.streaming = false;
              streamingContent.value = '';
              activeToolCall.value = null;
            } else if (data.type === 'error') {
              error.value = data.error;
              activeToolCall.value = null;
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
        // Roll back the optimistic user + (empty) assistant bubbles.
        for (const m of [assistantMsg, userMsg]) {
          const idx = chat.messages.indexOf(m);
          if (idx !== -1) chat.messages.splice(idx, 1);
        }
      } else {
        // Abort: keep what was streamed; just stop streaming state.
        assistantMsg.streaming = false;
      }
    } finally {
      isSending.value = false;
      isStreaming.value = false;
      streamingContent.value = '';
      activeToolCall.value = null;
      abortController = null;
      assistantMsg.streaming = false;
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
    chat.savedMessageIds = new Set();
    streamingContent.value = '';
    activeToolCall.value = null;
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
    activeToolCall,
    mutationSignal,
    lastMutation,
    savedMessageIds,
    markMessageSaved,
    unmarkMessageSaved,
    error,
    setEntity,
    setRoute,
    sendMessage,
    cancelStream,
    clearChat,
  };
}
