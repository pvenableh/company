<script setup lang="ts">
import { nextTick, onMounted } from 'vue';

const props = defineProps<{
  entityType:
    | 'client'
    | 'project'
    | 'invoice'
    | 'email'
    | 'marketing'
    | 'contact'
    | 'proposal'
    | 'team'
    | 'ticket'
    | 'lead'
    | 'financials'
    | 'list'
    | 'project_event'
    | 'channel'
    | 'social_post'
    | 'video_meeting';
  entityId: string;
  entityLabel: string;
  /**
   * Distinguishes "live" usage (in the meeting room) from "recap" usage
   * (the meeting detail page). Drives the default prompt set when no
   * explicit `prompts` override is passed.
   */
  surface?: 'live' | 'recap';
  /**
   * Override the static per-entityType prompt list. Pages with rich state
   * (e.g. /meetings/[id]) pass adaptive prompts derived from real data —
   * action-item counts, project name, summary status — instead of the
   * generic defaults. Empty / missing → fall back to the static map.
   */
  prompts?: string[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'entity-mutated', payload: { tool: string; data?: Record<string, any> }): void;
}>();

// Transition: component is v-if'd by parent, so we need a local
// visible flag that flips on nextTick to trigger the <Transition>.
const visible = ref(false);
onMounted(() => {
  nextTick(() => { visible.value = true; });
});

const handleClose = () => {
  visible.value = false;
  // Wait for leave transition to finish before actually unmounting
  setTimeout(() => emit('close'), 300);
};

const {
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
  sendMessage,
  cancelStream,
  clearChat,
} = useContextualChat();

// Bubble successful mutations to the host page so it can refetch its entity.
watch(mutationSignal, (n) => {
  if (n > 0 && lastMutation.value) {
    emit('entity-mutated', lastMutation.value);
  }
});

const { saveNoteFromMessage } = useAINotes();

const newMessage = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

const entityPrompts: Record<string, string[]> = {
  client: [
    'Summarize recent activity for this client',
    'Draft a follow-up email',
    'What\'s outstanding for this client?',
  ],
  project: [
    'Push the start date back 2 weeks',
    'What\'s blocking progress on this project?',
    'Summarize the task status',
    'Mark this project as In Progress',
  ],
  invoice: [
    'Why is this invoice overdue?',
    'Draft a payment reminder email',
    'Summarize payment history',
  ],
  email: [
    'Suggest a subject line for this email',
    'Improve the copy in this template',
    'What content blocks would work here?',
  ],
  marketing: [
    'What campaigns should I run this month?',
    'Analyze my email engagement trends',
    'Draft a content calendar for next week',
  ],
  contact: [
    'Summarize this contact\'s recent engagement',
    'Draft a personalized outreach email',
    'What lists and leads are linked to this contact?',
  ],
  proposal: [
    'Summarize this proposal and its status',
    'Draft a follow-up to the recipient',
    'What should I revise before sending?',
  ],
  team: [
    'What is this team working on right now?',
    'Summarize open goals and progress',
    'Draft a standup-style status update',
  ],
  ticket: [
    'Change priority to urgent',
    'Summarize what this ticket is about',
    'What\'s blocking progress here?',
    'Mark this ticket as In Review',
  ],
  lead: [
    'Summarize this lead and where it stands',
    'Draft a follow-up message',
    'What\'s the next best action for this lead?',
  ],
  financials: [
    'How is cashflow this month?',
    'Which invoices are overdue or at risk?',
    'Summarize revenue trends',
  ],
  list: [
    'Who\'s on this list and how is engagement?',
    'Suggest segments to peel off',
    'Draft an email to this audience',
  ],
  project_event: [
    'Move this event back one week',
    'Summarize this event and its current status',
    'What work remains before it ships?',
    'Mark this event as complete',
  ],
  channel: [
    'Summarize what\'s been discussed lately',
    'Who\'s active here and what are the open threads?',
    'Suggest what I should follow up on',
  ],
  social_post: [
    'Tighten the caption copy',
    'Suggest hashtags for this post',
    'Recommend the best posting time',
  ],
  // Recap (post-call) usage on /meetings/[id]
  video_meeting: [
    'Summarize the conversation',
    'Pull out action items I haven\'t promoted yet',
    'Draft a follow-up email to attendees',
    'What decisions came out of this meeting?',
  ],
};

// Meeting room (live, mid-call) prompts — different goal than recap. We're
// asking Earnest to help us *during* the call, not synthesize after.
const liveMeetingPrompts = [
  'What have we discussed so far?',
  'Capture the latest decision as a note',
  'Draft a follow-up for the client',
  'What should I cover before we wrap?',
  'Summarize where we are on the project',
];

const prompts = computed(() => {
  // Page-supplied adaptive prompts win over any defaults. Filter empties so
  // an over-eager computed never collapses the panel.
  if (Array.isArray(props.prompts) && props.prompts.filter(Boolean).length > 0) {
    return props.prompts.filter(Boolean);
  }
  if (props.entityType === 'video_meeting' && props.surface === 'live') {
    return liveMeetingPrompts;
  }
  return entityPrompts[props.entityType] || entityPrompts.client;
});

const entityTypeDisplay: Record<string, string> = {
  project_event: 'event',
  social_post: 'post',
  financials: 'dashboard',
  marketing: 'dashboard',
  video_meeting: 'meeting',
};

const entityTypeReadable = computed(() => entityTypeDisplay[props.entityType] || props.entityType);

const entityTypeLabel = computed(() => {
  const r = entityTypeReadable.value;
  return r.charAt(0).toUpperCase() + r.slice(1);
});

// Scroll behaviour: snap on user-initiated sends, smooth nudges during
// streaming, and respect the user — if they've scrolled away from the
// bottom we don't yank them back.
const isNearBottom = () => {
  const el = messagesContainer.value;
  if (!el) return true;
  return el.scrollHeight - (el.scrollTop + el.clientHeight) < 80;
};

const scrollToBottom = (smooth = false) => {
  const el = messagesContainer.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
};

let scrollRaf = 0;
const scheduleStreamScroll = () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    if (isNearBottom()) scrollToBottom(false);
  });
};

const handleSend = async () => {
  const content = newMessage.value.trim();
  if (!content) return;
  newMessage.value = '';
  await sendMessage(content);
  await nextTick();
  scrollToBottom();
};

const handlePromptClick = async (prompt: string) => {
  await sendMessage(prompt);
  await nextTick();
  scrollToBottom();
};

const handleSaveAsNote = async (msg: { id: string; content: string; serverId?: string }) => {
  const targetId = msg.serverId || msg.id;
  if (!sessionId.value || savedMessageIds.value.has(targetId)) return;
  markMessageSaved(targetId);
  try {
    const note = await saveNoteFromMessage(sessionId.value, msg.content, targetId);
    if (!note) throw new Error('Save failed');
    const { toast } = await import('vue-sonner');
    toast.success('Saved to your notes');
  } catch {
    unmarkMessageSaved(targetId);
    const { toast } = await import('vue-sonner');
    toast.error('Could not save note');
  }
};

// Feedback
const sidebarCorrectionTarget = ref<any>(null);
const sidebarCorrectionText = ref('');

const submitSidebarFeedback = async (msg: any, rating: 'positive' | 'negative', correction?: string) => {
  try {
    await $fetch(`/api/ai/messages/${msg.id}/feedback`, {
      method: 'POST',
      body: { rating, correction },
    });
    msg.feedback = { rating, correction };
  } catch (err: any) {
    console.warn('[ContextualSidebar] Feedback failed:', err.message);
  }
};

const openSidebarCorrection = (msg: any) => {
  if (sidebarCorrectionTarget.value?.id === msg.id) {
    sidebarCorrectionTarget.value = null;
    sidebarCorrectionText.value = '';
    return;
  }
  sidebarCorrectionTarget.value = msg;
  sidebarCorrectionText.value = '';
};

const submitSidebarCorrection = async () => {
  if (!sidebarCorrectionTarget.value) return;
  await submitSidebarFeedback(sidebarCorrectionTarget.value, 'negative', sidebarCorrectionText.value || undefined);
  sidebarCorrectionTarget.value = null;
  sidebarCorrectionText.value = '';
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};

// Set entity on mount and when props change
watch(
  () => [props.entityType, props.entityId],
  ([type, id]) => {
    if (type && id) {
      setEntity(type as string, id as string);
    }
  },
  { immediate: true },
);

// Auto-scroll on streaming — throttled, only if near bottom.
watch(streamingContent, () => {
  scheduleStreamScroll();
});

// Snap to bottom whenever the message *count* changes — that's a new send
// or the assistant bubble being staged. Smooth so it doesn't feel like a jump.
watch(() => messages.value.length, () => {
  nextTick(() => scrollToBottom(true));
});

// Markdown renderer (same pattern as AITray)
const renderMarkdown = (text: string): string => {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre class="bg-gray-900 text-gray-100 rounded-lg p-2 my-1 overflow-x-auto text-[11px] leading-relaxed"><code>${code.trim()}</code></pre>`,
  );
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h4 class="text-xs font-semibold mt-2 mb-0.5">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="text-sm font-semibold mt-2 mb-0.5">$1</h3>');
  html = html.replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-xs">$1</li>');
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li class="ml-3 list-decimal text-xs">$1</li>');
  // Source attribution badges
  html = html.replace(/\[Source:\s*([^\]]+)\]/g,
    '<span class="inline-flex items-center px-1.5 py-0 rounded-full bg-primary/10 text-primary text-[9px] font-medium whitespace-nowrap align-baseline mx-0.5">$1</span>');

  html = html.replace(/\n\n/g, '</p><p class="my-1">');
  html = html.replace(/\n/g, '<br>');
  return `<p class="my-0.5">${html}</p>`;
};
</script>

<template>
  <Transition name="ctx-sidebar">
    <div
      v-if="visible"
      class="fixed right-0 top-0 h-full w-full max-w-md bg-background shadow-2xl z-50 flex flex-col overflow-hidden border-l border-border"
    >
      <!-- Header -->
      <div class="border-b border-border/30 shrink-0">
        <div class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/5 to-violet-500/5">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <EarnestIcon class="w-4 h-4 text-primary" />
            </div>
            <div class="min-w-0">
              <h2 class="text-sm font-bold text-foreground truncate">
                Ask about this {{ entityTypeReadable }}
              </h2>
              <p class="text-[10px] text-muted-foreground truncate">{{ entityLabel }}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              v-if="hasHistory"
              @click="clearChat"
              class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
              title="New conversation"
            >
              <Icon name="lucide:plus" class="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              @click="handleClose()"
              class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            >
              <Icon name="lucide:x" class="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth">
        <!-- Loading history -->
        <div v-if="isLoadingHistory" class="flex flex-col items-center justify-center h-full text-center px-4">
          <div class="flex items-center gap-2 text-xs text-muted-foreground/70">
            <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" />
            Loading conversation...
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!messages.length && !isStreaming" class="flex flex-col items-center justify-center h-full text-center px-4">
          <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <EarnestIcon class="w-6 h-6 text-primary" />
          </div>
          <p class="text-sm font-medium text-foreground mb-1">
            Ask Earnest about this {{ entityTypeReadable }}
          </p>
          <p class="text-xs text-muted-foreground mb-4">
            I have full context on {{ entityLabel }} and can help you analyze, draft, or plan.
          </p>
          <div class="w-full space-y-2">
            <button
              v-for="prompt in prompts"
              :key="prompt"
              @click="handlePromptClick(prompt)"
              class="w-full text-left px-3 py-2 rounded-xl border border-border text-xs text-foreground hover:bg-primary/5 hover:border-primary/30 transition-colors"
            >
              <EarnestIcon class="w-3 h-3 text-primary/60 inline-block mr-1.5" />
              {{ prompt }}
            </button>
          </div>
        </div>

        <!-- Message list -->
        <TransitionGroup name="msg" tag="div" class="contents">
          <template v-for="msg in messages" :key="msg.key || msg.id">
            <!-- User message -->
            <div v-if="msg.role === 'user'" class="msg-row flex justify-end">
              <div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-xs leading-relaxed">
                {{ msg.content }}
              </div>
            </div>
            <!-- Assistant message (streaming or final — same bubble) -->
            <div v-else class="msg-row group flex justify-start">
              <div class="max-w-[90%]">
                <div
                  class="px-3 py-2 rounded-2xl rounded-bl-md bg-muted text-xs leading-relaxed text-foreground prose-sm"
                  :class="{ 'is-streaming': msg.streaming }"
                >
                  <span v-if="!msg.content && msg.streaming" class="typing-dots" aria-label="Thinking">
                    <span></span><span></span><span></span>
                  </span>
                  <template v-else>
                    <span v-html="renderMarkdown(msg.content)"></span>
                    <span v-if="msg.streaming" class="caret" aria-hidden="true"></span>
                  </template>
                </div>
                <div v-if="!msg.streaming" class="flex items-center gap-1 mt-0.5 ml-1 h-5">
                  <button
                    v-if="sessionId && !savedMessageIds.has(msg.serverId || msg.id)"
                    @click="handleSaveAsNote(msg)"
                    class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/70 hover:text-primary p-0.5 rounded"
                    title="Save as note"
                  >
                    <Icon name="lucide:bookmark" class="w-3 h-3" />
                  </button>
                  <span
                    v-else-if="savedMessageIds.has(msg.serverId || msg.id)"
                    class="text-[10px] text-primary/70 flex items-center gap-0.5"
                  >
                    <Icon name="lucide:bookmark-check" class="w-3 h-3" />
                    Saved
                  </span>
                  <button
                    @click="submitSidebarFeedback(msg, 'positive')"
                    class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                    :class="msg.feedback?.rating === 'positive' ? 'text-success' : 'text-muted-foreground/70 hover:text-success'"
                    title="Helpful"
                  >
                    <Icon name="lucide:thumbs-up" class="w-3 h-3" />
                  </button>
                  <button
                    @click="openSidebarCorrection(msg)"
                    class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                    :class="msg.feedback?.rating === 'negative' ? 'text-destructive' : 'text-muted-foreground/70 hover:text-destructive'"
                    title="Not helpful"
                  >
                    <Icon name="lucide:thumbs-down" class="w-3 h-3" />
                  </button>
                </div>
                <!-- Correction input -->
                <div
                  v-if="sidebarCorrectionTarget?.id === msg.id"
                  class="mt-1 ml-1 flex gap-1 items-end"
                >
                  <textarea
                    v-model="sidebarCorrectionText"
                    placeholder="What was wrong? (optional)"
                    class="flex-1 text-[11px] rounded-2xl glass-field px-2 py-1 resize-none focus:outline-none"
                    rows="2"
                    @keydown.enter.ctrl="submitSidebarCorrection"
                  />
                  <button
                    @click="submitSidebarCorrection"
                    class="px-2 py-1 rounded text-[9px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shrink-0"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          </template>
        </TransitionGroup>

        <!-- Tool call indicator -->
        <div v-if="activeToolCall" class="msg-row flex justify-start">
          <div class="tool-pill max-w-[90%] px-3 py-2 rounded-2xl rounded-bl-md border text-xs"
            :class="activeToolCall.success === false
              ? 'bg-destructive/10 dark:bg-destructive/20 border-destructive/30 dark:border-destructive text-destructive dark:text-destructive'
              : activeToolCall.success === true
                ? 'bg-success/10 dark:bg-success/20 border-success/30 dark:border-success text-success dark:text-success'
                : 'bg-info/10 dark:bg-info/20 border-info/30 dark:border-info text-info dark:text-info'"
          >
            <div class="flex items-center gap-1.5">
              <Icon
                v-if="activeToolCall.success === true"
                name="lucide:check-circle-2"
                class="w-3 h-3 shrink-0"
              />
              <Icon
                v-else-if="activeToolCall.success === false"
                name="lucide:x-circle"
                class="w-3 h-3 shrink-0"
              />
              <span v-else class="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
              <span class="font-medium">{{ activeToolCall.summary || activeToolCall.label }}</span>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="px-3 py-2 rounded-xl bg-destructive/10 dark:bg-destructive/20 text-xs text-destructive dark:text-destructive">
          {{ error }}
        </div>
      </div>

      <!-- Input -->
      <div class="border-t border-border/30 p-3 shrink-0">
        <div class="flex items-end gap-2">
          <textarea
            v-model="newMessage"
            @keydown="handleKeydown"
            :placeholder="`Ask about ${entityLabel}...`"
            :disabled="isSending"
            rows="1"
            class="flex-1 resize-none rounded-2xl glass-field px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none transition-colors"
            style="max-height: 96px"
          />
          <button
            @click="isStreaming ? cancelStream() : handleSend()"
            :disabled="!isStreaming && (!newMessage.trim() || isSending)"
            class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            :class="
              isStreaming
                ? 'bg-destructive hover:bg-destructive text-white'
                : newMessage.trim()
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'bg-muted text-muted-foreground/70'
            "
          >
            <Icon :name="isStreaming ? 'lucide:square' : 'lucide:arrow-up'" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ctx-sidebar-enter-active,
.ctx-sidebar-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.ctx-sidebar-enter-from,
.ctx-sidebar-leave-to {
  transform: translateX(100%);
}

/* ── Message list transitions ── */
.msg-row {
  /* Smooth content-driven height changes during streaming so the bubble
     grows fluidly instead of snapping line-by-line. */
  transition: max-height 0.2s ease-out;
}
.msg-enter-active {
  transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}
.msg-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.msg-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* The streaming bubble itself gets a subtle pulse on its border so it's
   visually distinct from a settled response. */
.is-streaming {
  box-shadow: inset 0 0 0 1px hsl(var(--primary) / 0.12);
}

/* Inline blinking caret at end of streamed text. */
.caret {
  display: inline-block;
  width: 2px;
  height: 0.95em;
  margin-left: 2px;
  vertical-align: -2px;
  background: hsl(var(--primary) / 0.7);
  border-radius: 1px;
  animation: caret-blink 0.9s steps(1) infinite;
}
@keyframes caret-blink {
  0%, 50% { opacity: 1; }
  50.01%, 100% { opacity: 0; }
}

/* Typing dots placeholder shown while waiting for first chunk. */
.typing-dots {
  display: inline-flex;
  gap: 4px;
  padding: 2px 0;
}
.typing-dots span {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: hsl(var(--muted-foreground) / 0.55);
  animation: typing-bounce 1.1s ease-in-out infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.15s; }
.typing-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.55; }
  40%           { transform: translateY(-3px); opacity: 1; }
}

/* Tool-call pill: ease the colour swap when it flips from running → success/error. */
.tool-pill {
  transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}

@media (prefers-reduced-motion: reduce) {
  .msg-enter-active,
  .msg-leave-active,
  .typing-dots span,
  .caret {
    animation: none !important;
    transition: none !important;
  }
}
</style>
