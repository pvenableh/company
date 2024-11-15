<script setup>
import { ref } from 'vue';
import { useMentionPlugin } from './composables/useMentionPlugin';

const props = defineProps({
	parentId: {
		type: String,
		required: true,
	},
	collection: {
		type: String,
		required: true,
	},
});

const { user } = useDirectusAuth();
const content = ref('');
const { editor } = useMentionPlugin(content);

const postComment = async () => {
	if (!content.value.trim()) return;

	try {
		// Create the comment
		const comment = await useDirectus(
			createItem('comments', {
				comment: content.value,
				user: user.value.id,
				collection: props.collection,
			}),
		);

		// Create the junction
		await useDirectus(
			createItem(`${props.collection}_comments`, {
				[`${props.collection}_id`]: props.parentId,
				comments_id: comment.id,
			}),
		);

		// Clear the editor
		editor.value.commands.clearContent();
		content.value = '';
	} catch (error) {
		console.error('Error creating comment:', error);
	}
};
</script>

<template>
	<div class="create-comment bg-white rounded-lg shadow p-4">
		<editor-content :editor="editor" class="prose max-w-none" />

		<div class="flex justify-end mt-2">
			<UButton color="primary" :disabled="!content" @click="postComment">Post Comment</UButton>
		</div>
	</div>
</template>
<style>
.comment-input {
	border-radius: 18px;
	background: rgb(245, 245, 245);
	font-size: 14px;
	@apply px-4 border-none shadow-inner dark:bg-black dark:text-white;
	padding-right: 40px;
}
.post-btn {
	line-height: 18px;
	font-size: 15px;
	color: var(--cyan);
	top: calc(50% - 17px);
}
</style>
