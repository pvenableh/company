// components/comments/CommentInput.vue
<script setup>
const props = defineProps({
	replyingTo: {
		type: Object,
		default: null,
	},
	loading: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['submit', 'cancel']);
const comment = ref('');

function handleSubmit() {
	if (!comment.value.trim()) return;
	emit('submit', comment.value);
	comment.value = '';
}

function handleCancel() {
	comment.value = '';
	emit('cancel');
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<div v-if="replyingTo" class="flex items-center gap-2 text-sm text-gray-500">
			<span>Replying to {{ replyingTo.comments_id.user?.first_name }}'s comment</span>
			<UButton size="xs" variant="ghost" icon="i-heroicons-x-mark" @click="handleCancel" />
		</div>

		<div class="flex gap-2">
			<UTextarea
				v-model="comment"
				:placeholder="replyingTo ? 'Write a reply...' : 'Write a comment...'"
				rows="1"
				class="flex-grow"
				@keydown.enter.exact.prevent="handleSubmit"
			/>
			<UButton color="primary" :loading="loading" @click="handleSubmit">
				{{ replyingTo ? 'Reply' : 'Post' }}
			</UButton>
		</div>
	</div>
</template>
