<script setup lang="ts">
/**
 * Read-only modal for viewing a team member's AI chat session.
 * Used in the Team AI Activity admin page.
 */

const props = defineProps<{
  modelValue: boolean;
  sessionId: string;
  organizationId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const session = ref<any>(null);
const messages = ref<any[]>([]);
const isLoading = ref(false);

watch(() => [props.modelValue, props.sessionId], async ([open, id]) => {
  if (open && id) {
    isLoading.value = true;
    try {
      const response = await $fetch('/api/ai/manage/team-session-messages', {
        params: {
          sessionId: id,
          organizationId: props.organizationId,
        },
      }) as any;
      session.value = response?.session || null;
      messages.value = response?.messages || [];
    } catch (err: any) {
      console.error('[TeamSessionViewer] Failed to load session:', err);
    } finally {
      isLoading.value = false;
    }
  }
}, { immediate: true });

const config = useRuntimeConfig();
const getUserAvatar = (avatarId: string | null) => {
  if (!avatarId) return '';
  return `${config.public.directusUrl || ''}/assets/${avatarId}?width=64&height=64&fit=cover`;
};

const formatTime = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const renderMarkdown = (text: string): string => {
  if (!text) return '';
  let html = text;
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre class="bg-gray-900 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs leading-relaxed"><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-1 space-y-0.5">$&</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>');
  // Source attribution badges
  html = html.replace(/\[Source:\s*([^\]]+)\]/g,
    '<span class="inline-flex items-center px-1.5 py-0 rounded-full bg-primary/10 text-primary text-[9px] font-medium whitespace-nowrap align-baseline mx-0.5">$1</span>');
  html = html.replace(/\n/g, '<br>');
  return html;
};
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'max-w-2xl' }">
    <UCard class="max-h-[80vh] flex flex-col">
      <template #header>
        <div class="flex items-center gap-3">
          <img
            v-if="session?.user_avatar"
            :src="getUserAvatar(session.user_avatar)"
            class="w-8 h-8 rounded-full"
            alt=""
          />
          <div
            v-else
            class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"
          >
            <UIcon name="i-heroicons-user" class="w-4 h-4 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold truncate">{{ session?.title || 'Untitled Conversation' }}</h3>
            <p class="text-[10px] text-muted-foreground">
              {{ session?.user_name || 'Unknown' }}
              <span v-if="session?.date_created"> — {{ new Date(session.date_created).toLocaleDateString() }}</span>
            </p>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
            Read-only
          </span>
        </div>
      </template>

      <!-- Messages -->
      <div class="flex-1 overflow-y-auto space-y-4 py-2">
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="messages.length === 0" class="text-center py-12 text-muted-foreground text-sm">
          No messages in this session.
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="flex gap-3"
          :class="msg.role === 'user' ? 'flex-row-reverse' : ''"
        >
          <!-- Avatar -->
          <div class="flex-shrink-0 mt-0.5">
            <img
              v-if="msg.role === 'user' && session?.user_avatar"
              :src="getUserAvatar(session.user_avatar)"
              class="w-7 h-7 rounded-full"
              alt=""
            />
            <div
              v-else-if="msg.role === 'user'"
              class="w-7 h-7 rounded-full bg-muted flex items-center justify-center"
            >
              <UIcon name="i-heroicons-user" class="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div
              v-else
              class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-primary" />
            </div>
          </div>

          <!-- Content -->
          <div
            class="max-w-[80%] rounded-xl px-4 py-2.5"
            :class="msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'"
          >
            <p v-if="msg.role === 'user'" class="text-sm whitespace-pre-wrap break-words">
              {{ msg.content }}
            </p>
            <div
              v-else
              class="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&>p]:my-1 [&>ul]:my-1"
              v-html="renderMarkdown(msg.content)"
            />
            <p
              class="text-[10px] mt-1"
              :class="msg.role === 'user' ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground'"
            >
              {{ formatTime(msg.date_created) }}
            </p>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" size="sm" @click="emit('update:modelValue', false)">
            Close
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
