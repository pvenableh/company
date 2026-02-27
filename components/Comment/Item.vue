<script setup lang="ts">
import type { CommentWithRelations } from '~/types/comments';

const props = defineProps<{
  comment: CommentWithRelations;
  depth: number;
}>();

const emit = defineEmits<{
  reply: [content: string, parentId: string];
  delete: [commentId: string];
}>();

const { canEditComment } = useComments();
const config = useRuntimeConfig();

const showReplyForm = ref(false);
const replySubmitting = ref(false);
const deleteLoading = ref(false);

const isOwner = computed(() => canEditComment(props.comment));
const maxDepth = 4;
const canReply = computed(() => props.depth < maxDepth);

const timeAgo = computed(() => {
  if (!props.comment.date_created) return '';
  const date = new Date(props.comment.date_created);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
});

function handleReplySubmit(content: string) {
  emit('reply', content, props.comment.id);
  showReplyForm.value = false;
}

function handleDelete() {
  emit('delete', props.comment.id);
}

function handleNestedReply(content: string, parentId: string) {
  emit('reply', content, parentId);
}

function handleNestedDelete(commentId: string) {
  emit('delete', commentId);
}
</script>

<template>
  <div class="comment-item flex gap-2.5">
    <!-- Avatar -->
    <Avatar class="h-7 w-7 flex-shrink-0">
      <AvatarImage
        v-if="comment.user_created?.avatar"
        :src="`${config.public.directusUrl}/assets/${comment.user_created.avatar}`"
        :alt="comment.user_created?.first_name"
      />
      <AvatarFallback class="text-[8px]">
        {{ (comment.user_created?.first_name?.[0] || '') + (comment.user_created?.last_name?.[0] || '') }}
      </AvatarFallback>
    </Avatar>

    <div class="flex-1 min-w-0">
      <!-- Header -->
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-bold uppercase">
          {{ comment.user_created?.first_name }} {{ comment.user_created?.last_name }}
        </span>
        <span class="text-[9px] text-gray-400">{{ timeAgo }}</span>
        <span v-if="comment.is_edited" class="text-[8px] text-gray-400 italic">(edited)</span>
        <Badge v-if="comment.is_resolved" variant="outline" class="text-[7px] uppercase h-4">
          Resolved
        </Badge>
      </div>

      <!-- Content -->
      <div
        class="mt-1 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5"
      >
        <div class="prose prose-sm max-w-none dark:prose-invert" v-html="comment.content" />

        <!-- Attached files -->
        <div v-if="comment.files?.length" class="mt-2 flex flex-wrap gap-1.5">
          <a
            v-for="file in comment.files"
            :key="file.id"
            :href="`${config.public.directusUrl}/assets/${file.directus_files_id.id}`"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-[9px] text-gray-500 hover:text-gray-700 bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5"
          >
            <Icon name="i-heroicons-paper-clip" class="h-2.5 w-2.5" />
            {{ file.directus_files_id.filename_download }}
          </a>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 mt-1">
        <button
          v-if="canReply"
          class="text-[9px] uppercase tracking-wider text-gray-400 hover:text-gray-600 font-medium"
          @click="showReplyForm = !showReplyForm"
        >
          Reply
        </button>
        <button
          v-if="isOwner"
          class="text-[9px] uppercase tracking-wider text-red-400 hover:text-red-600 font-medium"
          :disabled="deleteLoading"
          @click="handleDelete"
        >
          Delete
        </button>
      </div>

      <!-- Reply form -->
      <div v-if="showReplyForm" class="mt-2">
        <CommentEditor
          :loading="replySubmitting"
          placeholder="Write a reply..."
          compact
          @submit="handleReplySubmit"
          @cancel="showReplyForm = false"
        />
      </div>

      <!-- Nested replies -->
      <div
        v-if="comment.replies?.length"
        class="mt-3 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-3"
      >
        <CommentItem
          v-for="reply in comment.replies"
          :key="reply.id"
          :comment="reply"
          :depth="depth + 1"
          @reply="handleNestedReply"
          @delete="handleNestedDelete"
        />
      </div>
    </div>
  </div>
</template>
