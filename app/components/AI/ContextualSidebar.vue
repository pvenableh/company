<script setup lang="ts">
import { nextTick, onMounted } from 'vue';

const props = defineProps<{
  entityType: 'client' | 'project' | 'invoice' | 'email' | 'marketing';
  entityId: string;
  entityLabel: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
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
  error,
  setEntity,
  sendMessage,
  cancelStream,
  clearChat,
} = useContextualChat();

const { saveNoteFromMessage } = useAINotes();
const savedMessageIds = ref(new Set<string>());

const newMessage = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

const entityPrompts: Record<string, string[]> = {
  client: [
    'Summarize recent activity for this client',
    'Draft a follow-up email',
    'What\'s outstanding for this client?',
  ],
  project: [
    'What\'s blocking progress on this project?',
    'Summarize the task status',
    'Draft a status update for the team',
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
};

const prompts = computed(() => entityPrompts[props.entityType] || entityPrompts.client);

const entityTypeLabel = computed(() => {
  return props.entityType.charAt(0).toUpperCase() + props.entityType.slice(1);
});

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
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

const handleSaveAsNote = async (msg: { id: string; content: string }) => {
  if (!sessionId.value || savedMessageIds.value.has(msg.id)) return;
  savedMessageIds.value.add(msg.id);
  try {
    await saveNoteFromMessage(sessionId.value, msg.content, msg.id);
  } catch {
    savedMessageIds.value.delete(msg.id);
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

// Auto-scroll on streaming
watch(streamingContent, () => {
  nextTick(() => scrollToBottom());
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
            <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon name="lucide:sparkles" class="w-4 h-4 text-primary" />
            </div>
            <div class="min-w-0">
              <h2 class="text-sm font-bold text-foreground truncate">
                Ask about this {{ entityType }}
              </h2>
              <p class="text-[10px] text-muted-foreground truncate">{{ entityLabel }}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              v-if="hasHistory"
              @click="clearChat"
              class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              title="New conversation"
            >
              <Icon name="lucide:plus" class="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              @click="handleClose()"
              class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
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
          <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <Icon name="lucide:sparkles" class="w-6 h-6 text-primary" />
          </div>
          <p class="text-sm font-medium text-foreground mb-1">
            Ask Earnest about this {{ entityType }}
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
              <Icon name="lucide:sparkles" class="w-3 h-3 text-primary/60 inline mr-1.5" />
              {{ prompt }}
            </button>
          </div>
        </div>

        <!-- Message list -->
        <template v-for="msg in messages" :key="msg.id">
          <!-- User message -->
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-primary text-white text-xs leading-relaxed">
              {{ msg.content }}
            </div>
          </div>
          <!-- Assistant message -->
          <div v-else class="group flex justify-start">
            <div class="max-w-[90%]">
              <div
                class="px-3 py-2 rounded-2xl rounded-bl-md bg-muted text-xs leading-relaxed text-foreground prose-sm"
                v-html="renderMarkdown(msg.content)"
              />
              <div class="flex items-center gap-1 mt-0.5 ml-1 h-5">
                <button
                  v-if="sessionId && !savedMessageIds.has(msg.id)"
                  @click="handleSaveAsNote(msg)"
                  class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/70 hover:text-primary p-0.5 rounded"
                  title="Save as note"
                >
                  <Icon name="lucide:bookmark" class="w-3 h-3" />
                </button>
                <span
                  v-else-if="savedMessageIds.has(msg.id)"
                  class="text-[10px] text-primary/70 flex items-center gap-0.5"
                >
                  <Icon name="lucide:bookmark-check" class="w-3 h-3" />
                  Saved
                </span>
                <button
                  @click="submitSidebarFeedback(msg, 'positive')"
                  class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                  :class="msg.feedback?.rating === 'positive' ? 'text-green-500' : 'text-muted-foreground/70 hover:text-green-500'"
                  title="Helpful"
                >
                  <Icon name="lucide:thumbs-up" class="w-3 h-3" />
                </button>
                <button
                  @click="openSidebarCorrection(msg)"
                  class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                  :class="msg.feedback?.rating === 'negative' ? 'text-red-500' : 'text-muted-foreground/70 hover:text-red-500'"
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
                  class="flex-1 text-[11px] rounded border border-border bg-background px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  rows="2"
                  @keydown.enter.ctrl="submitSidebarCorrection"
                />
                <button
                  @click="submitSidebarCorrection"
                  class="px-2 py-1 rounded text-[9px] font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors shrink-0"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Streaming preview -->
        <div v-if="isStreaming && streamingContent" class="flex justify-start">
          <div class="max-w-[90%]">
            <div
              class="px-3 py-2 rounded-2xl rounded-bl-md bg-muted text-xs leading-relaxed text-foreground prose-sm"
              v-html="renderMarkdown(streamingContent)"
            />
            <span class="inline-block w-1.5 h-3.5 bg-primary/60 rounded-sm animate-pulse ml-1" />
          </div>
        </div>

        <!-- Loading indicator -->
        <div v-if="isSending && !streamingContent" class="flex justify-start">
          <div class="px-3 py-2 rounded-2xl rounded-bl-md bg-muted">
            <div class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style="animation-delay: 0ms" />
              <span class="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style="animation-delay: 150ms" />
              <span class="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce" style="animation-delay: 300ms" />
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">
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
            class="flex-1 resize-none rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
            style="max-height: 96px"
          />
          <button
            @click="isStreaming ? cancelStream() : handleSend()"
            :disabled="!isStreaming && (!newMessage.trim() || isSending)"
            class="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            :class="
              isStreaming
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : newMessage.trim()
                  ? 'bg-primary hover:bg-primary/90 text-white'
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
</style>
