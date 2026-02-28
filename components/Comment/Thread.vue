<script setup lang="ts">
import type { CommentWithRelations } from '~/types/comments';

const props = defineProps<{
  collection: string;
  itemId: string;
}>();

const { getComments, createComment, deleteComment } = useComments();

const comments = ref<CommentWithRelations[]>([]);
const loading = ref(true);
const submitting = ref(false);

async function fetchComments() {
  loading.value = true;
  try {
    comments.value = await getComments(props.collection, props.itemId, {
      includeReplies: true,
      parentId: null,
    });
  } catch (e) {
    console.error('Failed to fetch comments:', e);
  } finally {
    loading.value = false;
  }
}

async function handleSubmit(content: string, parentId?: number) {
  submitting.value = true;
  try {
    await createComment({
      comment: content,
      collection: props.collection,
      item: props.itemId,
      parent_id: parentId,
    });
    await fetchComments();
  } catch (e) {
    console.error('Failed to create comment:', e);
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(commentId: number) {
  try {
    await deleteComment(commentId);
    await fetchComments();
  } catch (e) {
    console.error('Failed to delete comment:', e);
  }
}

onMounted(() => {
  fetchComments();
});

watch(() => props.itemId, () => {
  fetchComments();
});
</script>

<template>
  <div class="comment-thread space-y-4">
    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center py-4">
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#C4A052]" />
    </div>

    <!-- Comments list -->
    <div v-else-if="comments.length > 0" class="space-y-3">
      <CommentItem
        v-for="comment in comments"
        :key="comment.id"
        :comment="comment"
        :depth="0"
        @reply="(content: string, parentId: number) => handleSubmit(content, parentId)"
        @delete="handleDelete"
      />
    </div>

    <p v-else class="text-xs text-gray-400 text-center py-4">
      No comments yet. Be the first to comment.
    </p>

    <!-- New comment editor -->
    <CommentEditor
      :loading="submitting"
      placeholder="Write a comment..."
      @submit="(content: string) => handleSubmit(content)"
    />
  </div>
</template>
