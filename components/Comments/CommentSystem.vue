<!-- CommentSystem.vue -->
<script setup>
import { ref, computed } from 'vue';
import { useRealtimeSubscription } from './composables/useRealtimeSubscription';

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
const { deleteItem, updateItem } = useDirectusItems();
const showComments = ref(true);
const editingCommentId = ref(null);

// Use the realtime subscription
const { data: comments } = useRealtimeSubscription(
	`${props.collection}_comments`,
	['id', 'comments_id.*', 'comments_id.user.*'],
	{
		[`${props.collection}_id`]: {
			_eq: props.parentId,
		},
	},
	'-comments_id.date_created',
);

const commentsTotal = computed(() => comments.value.length);

const deleteComment = async (commentId) => {
	try {
		// Delete the junction first
		await deleteItem(`${props.collection}_comments`, commentId);
		// Then delete the actual comment
		await deleteItem('comments', commentId);
	} catch (error) {
		console.error('Error deleting comment:', error);
	}
};

const startEditing = (commentId) => {
	editingCommentId.value = commentId;
};

const cancelEditing = () => {
	editingCommentId.value = null;
};

const updateComment = async (commentId, newContent) => {
	try {
		await updateItem('comments', commentId, {
			comment: newContent,
		});
		editingCommentId.value = null;
	} catch (error) {
		console.error('Error updating comment:', error);
	}
};
</script>

<template>
	<div class="comments-system w-full">
		<div class="comments-header flex justify-between items-center mb-4">
			<h3 class="text-lg font-semibold">Comments ({{ commentsTotal }})</h3>
			<UToggle
				v-model="showComments"
				color="gray"
				:on-icon="{ icon: 'i-heroicons-chat-bubble-left-right-solid' }"
				:off-icon="{ icon: 'i-heroicons-x-mark-20-solid' }"
			/>
		</div>

		<TransitionGroup v-if="showComments" name="comment" tag="div" class="comments-list space-y-4">
			<CommentCreate :key="'create'" :parent-id="parentId" :collection="collection" class="mb-6" />

			<CommentItem
				v-for="comment in comments"
				:key="comment.id"
				:comment="comment"
				:is-editing="editingCommentId === comment.comments_id.id"
				:current-user="user"
				@edit="startEditing"
				@cancel-edit="cancelEditing"
				@update="updateComment"
				@delete="deleteComment"
			/>
		</TransitionGroup>
	</div>
</template>

<style scoped>
.comment-enter-active,
.comment-leave-active {
	transition: all 0.3s ease;
}

.comment-enter-from,
.comment-leave-to {
	opacity: 0;
	transform: translateY(30px);
}
</style>

<!-- CommentItem.vue -->
<script setup>
import { ref } from 'vue';
import { useMentionPlugin } from './composables/useMentionPlugin';

const props = defineProps({
	comment: {
		type: Object,
		required: true,
	},
	isEditing: {
		type: Boolean,
		default: false,
	},
	currentUser: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['edit', 'cancel-edit', 'update', 'delete']);

const editedContent = ref('');
const { editor } = useMentionPlugin(editedContent);

const avatar = computed(() => {
	if (props.comment.comments_id.user.avatar) {
		return `${useRuntimeConfig().public.apiBase}/assets/${props.comment.comments_id.user.avatar}?key=medium`;
	}
	return `https://ui-avatars.com/api/?name=${props.comment.comments_id.user.first_name}+${props.comment.comments_id.user.last_name}`;
});

const isOwner = computed(() => {
	return props.currentUser?.id === props.comment.comments_id.user.id;
});

const handleUpdate = () => {
	emit('update', props.comment.comments_id.id, editedContent.value);
};
</script>

<template>
	<div class="comment-item flex gap-3 p-4 bg-gray-50 rounded-lg">
		<UAvatar :src="avatar" :alt="comment.comments_id.user.first_name" size="sm" />

		<div class="flex-grow">
			<div class="flex justify-between items-start">
				<div>
					<span class="font-medium">
						{{ comment.comments_id.user.first_name }} {{ comment.comments_id.user.last_name }}
					</span>
					<span class="text-sm text-gray-500 ml-2">
						{{ useTimeAgo(comment.comments_id.date_created) }}
					</span>
				</div>

				<div v-if="isOwner" class="flex gap-2">
					<UButton
						v-if="!isEditing"
						icon="i-heroicons-pencil"
						color="gray"
						variant="ghost"
						size="xs"
						@click="$emit('edit', comment.comments_id.id)"
					/>
					<UButton
						v-if="!isEditing"
						icon="i-heroicons-trash"
						color="red"
						variant="ghost"
						size="xs"
						@click="$emit('delete', comment.id)"
					/>
				</div>
			</div>

			<div v-if="!isEditing" class="comment-content mt-1 text-gray-700" v-html="comment.comments_id.comment" />

			<div v-else class="mt-2">
				<editor-content :editor="editor" />
				<div class="flex gap-2 mt-2">
					<UButton size="sm" color="primary" @click="handleUpdate">Save</UButton>
					<UButton size="sm" color="gray" variant="soft" @click="$emit('cancel-edit')">Cancel</UButton>
				</div>
			</div>
		</div>
	</div>
</template>

<!-- CommentCreate.vue -->
<script setup>
import { ref } from 'vue';
import { useDirectusAuth, useDirectus } from '#imports';
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

<!-- composables/useMentionPlugin.js -->
import { ref, watch } from 'vue'; import { useEditor, Editor } from '@tiptap/vue-3'; import StarterKit from
'@tiptap/starter-kit'; import Mention from '@tiptap/extension-mention'; import { useDirectusUsers } from
'@directus/sdk-js'; export function useMentionPlugin(content) { const directusUsers = useDirectusUsers(); const
suggestions = ref([]); const fetchUsers = async (query) => { try { const users = await directusUsers.readMany({ search:
query, fields: ['id', 'first_name', 'last_name', 'email'] }); suggestions.value = users.map(user => ({ id: user.id,
label: `${user.first_name} ${user.last_name}`, email: user.email })); } catch (error) { console.error('Error fetching
users:', error); suggestions.value = []; } }; const editor = useEditor({ content: content.value, extensions: [
StarterKit, Mention.configure({ HTMLAttributes: { class: 'mention', }, suggestion: { items: ({ query }) => {
fetchUsers(query); return suggestions.value; }, render: () => { // Implementation of mention suggestion rendering //
Using NuxtUI's dropdown for suggestions return { onStart: (props) => { // Show suggestion dropdown }, onUpdate(props) {
// Update suggestions }, onKeyDown(props) { // Handle keyboard navigation }, onExit() { // Clean up }, }; }, }, }), ],
onUpdate: ({ editor }) => { content.value = editor.getHTML(); }, }); watch(content, (newContent) => { if (editor.value
&& newContent !== editor.value.getHTML()) { editor.value.commands.setContent(newContent); } }); return { editor,
suggestions }; }
