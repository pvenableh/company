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
const toast = useToast();
const { user } = useDirectusAuth();
const content = ref('');
const { editor, showSuggestions, suggestionPosition, suggestions, selectedIndex, isLoading } =
	useMentionPlugin(content);

const postComment = async () => {
	if (!content.value.trim()) return;

	try {
		// Extract mentioned user IDs from the content
		const mentionRegex = /data-user-id="([^"]+)"/g;
		const mentionedUsers = [...content.value.matchAll(mentionRegex)].map((match) => match[1]);

		// Create the comment
		const comment = await useDirectus(
			createItem('comments', {
				comment: content.value,
				user: user.value.id,
				collection: props.collection,
				mentioned_users: mentionedUsers,
			}),
		);

		// Create the junction
		await createItem(`${props.collection}_comments`, {
			[`${props.collection}_id`]: props.parentId,
			comments_id: comment.id,
		});

		// Clear the editor
		editor.value.commands.clearContent();
		content.value = '';
	} catch (error) {
		console.error('Error creating comment:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to post comment',
			color: 'red',
		});
	}
};

// Cleanup on component unmount
onBeforeUnmount(() => {
	if (editor.value) {
		editor.value.destroy();
	}
});
</script>

<template>
	<div class="create-comment bg-white dark:bg-gray-800 rounded-lg shadow p-4">
		<div class="relative">
			<!-- TipTap Editor -->
			<editor-content :editor="editor" class="prose dark:prose-invert max-w-none" />

			<!-- Mention Suggestions Dropdown -->
			<div
				v-if="showSuggestions"
				class="absolute z-50 bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden border dark:border-gray-700"
				:style="{
					left: `${suggestionPosition.x}px`,
					top: `${suggestionPosition.y}px`,
					minWidth: '200px',
				}"
			>
				<div v-if="isLoading" class="p-2 text-sm text-gray-500 dark:text-gray-400">Loading users...</div>
				<div v-else class="max-h-[200px] overflow-y-auto">
					<div
						v-for="(user, index) in suggestions"
						:key="user.id"
						class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2"
						:class="{ 'bg-gray-100 dark:bg-gray-700': index === selectedIndex }"
					>
						<UAvatar :src="user.avatar" :alt="user.label" size="sm" />
						<div>
							<div class="font-medium">{{ user.label }}</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">
								{{ user.email }}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="flex justify-end mt-2">
			<UButton color="primary" :disabled="!content.trim()" :loading="isLoading" @click="postComment">
				Post Comment
			</UButton>
		</div>
	</div>
</template>

<style>
.create-comment .ProseMirror {
	@apply min-h-[100px] p-3 rounded-lg bg-gray-50 dark:bg-gray-900;
	outline: none;
}

.create-comment .ProseMirror p {
	margin: 0;
}

/* Mention styles */
.mention {
	@apply bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 
         rounded px-1 py-0.5 text-sm font-medium no-underline;
}

/* Placeholder styles */
.create-comment .ProseMirror p.is-empty::before {
	content: 'Write a comment... (Use @ to mention someone)';
	@apply text-gray-400 dark:text-gray-600 float-left h-0;
	pointer-events: none;
}

/* Dark mode prose overrides */
.dark .prose {
	@apply text-gray-300;
}

.dark .prose a {
	@apply text-blue-400;
}

/* Focus state */
.create-comment .ProseMirror:focus {
	@apply outline-none ring-2 ring-blue-500 ring-opacity-50;
}

/* Transition for suggestions dropdown */
.mention-suggestions-enter-active,
.mention-suggestions-leave-active {
	transition: opacity 0.2s ease;
}

.mention-suggestions-enter-from,
.mention-suggestions-leave-to {
	opacity: 0;
}
</style>
