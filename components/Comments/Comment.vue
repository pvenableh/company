<script setup>
import { useMentionPlugin } from '~/composables/useMentionPlugin';
import { EditorContent } from '@tiptap/vue-3';

const props = defineProps({
	replyingTo: {
		type: Object,
		default: null,
	},
	loading: {
		type: Boolean,
		default: false,
	},
	depth: {
		type: Number,
		default: 0,
	},
});

const emit = defineEmits(['submit', 'cancel']);
const editorContent = ref('');

// Initialize the editor with mention plugin
const { editor, suggestions, showSuggestions, suggestionPosition, selectedIndex } = useMentionPlugin(editorContent);

function handleSubmit() {
	if (editor?.value && !editor.value.isEmpty) {
		emit('submit', editor.value.getHTML());
		editor.value.commands.setContent(''); // Clear the editor after submission
	}
}

function handleKeydown(event) {
	// Handle keyboard shortcuts for submission or cancellation
	if (!showSuggestions.value) {
		if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			handleSubmit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			emit('cancel');
		}
	}
}

function selectMention(suggestion) {
	console.log('Selected mention:', suggestion);
	// Additional handling for selected mentions can be implemented here
}
</script>

<template>
	<div class="relative flex flex-col gap-2" :class="`depth-${depth}`">
		<!-- Reply Context -->
		<div v-if="replyingTo" class="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
			<span class="text-gray-500">Replying to {{ replyingTo.comments_id.user?.first_name }}'s comment:</span>
			<p class="text-sm font-medium truncate flex-1">{{ replyingTo.comments_id.comment }}</p>
			<UButton size="xs" variant="ghost" icon="i-heroicons-x-mark" @click="$emit('cancel')" />
		</div>

		<!-- Comment Input -->
		<div class="flex gap-2">
			<div class="relative flex-grow">
				<!-- TipTap Editor -->
				<div
					class="prose dark:prose-invert max-w-none w-full bg-white dark:bg-gray-800 rounded-lg p-3 min-h-[40px] border dark:border-gray-700"
					@keydown="handleKeydown"
				>
					<EditorContent :editor="editor" />
				</div>

				<!-- Mentions Dropdown -->
				<Teleport to="body">
					<Transition
						enter-active-class="transition duration-200 ease-out"
						enter-from-class="opacity-0 scale-95"
						enter-to-class="opacity-100 scale-100"
						leave-active-class="transition duration-150 ease-in"
						leave-from-class="opacity-100 scale-100"
						leave-to-class="opacity-0 scale-95"
					>
						<div
							v-if="showSuggestions && suggestions.length"
							class="fixed z-50 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 overflow-hidden"
							:style="{
								left: `${suggestionPosition.x}px`,
								top: `${suggestionPosition.y}px`,
							}"
						>
							<div class="max-h-48 overflow-y-auto py-1">
								<div
									v-for="(suggestion, index) in suggestions"
									:key="suggestion.id"
									class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2"
									:class="{ 'bg-gray-100 dark:bg-gray-700': index === selectedIndex }"
									@click="selectMention(suggestion)"
								>
									<UAvatar
										:src="
											suggestion.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${suggestion.avatar}` : null
										"
										:alt="suggestion.label"
										size="sm"
									/>
									<div>
										<div class="font-medium text-sm">{{ suggestion.label }}</div>
										<div class="text-xs text-gray-500">{{ suggestion.email }}</div>
									</div>
								</div>
							</div>
						</div>
					</Transition>
				</Teleport>
			</div>

			<!-- Submit Button -->
			<UButton color="primary" :loading="loading" @click="handleSubmit" :disabled="editor?.isEmpty">
				{{ replyingTo ? 'Reply' : 'Post' }}
			</UButton>
		</div>

		<p class="text-xs text-gray-500 mt-1">Press @ to mention someone • Ctrl/Cmd + Enter to submit</p>
	</div>
</template>

<style>
/* Editor Styles */
.ProseMirror {
	outline: none;
	min-height: 40px;
}

.ProseMirror p {
	margin: 0;
}

/* Depth-based Indentation */
.depth-0 {
	margin-left: 0;
}
.depth-1 {
	margin-left: 2rem;
}
.depth-2 {
	margin-left: 4rem;
}
.depth-3 {
	margin-left: 6rem;
}
.depth-4 {
	margin-left: 8rem;
}

/* Responsive Indentation */
@media (max-width: 768px) {
	.depth-1 {
		margin-left: 1rem;
	}
	.depth-2 {
		margin-left: 2rem;
	}
	.depth-3 {
		margin-left: 3rem;
	}
	.depth-4 {
		margin-left: 4rem;
	}
}

/* Mention Dropdown Styles */
.suggestions-dropdown {
	scrollbar-width: thin;
	scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
	z-index: 9999;
}

.suggestions-dropdown::-webkit-scrollbar {
	width: 6px;
}

.suggestions-dropdown::-webkit-scrollbar-track {
	background: transparent;
}

.suggestions-dropdown::-webkit-scrollbar-thumb {
	background-color: rgba(156, 163, 175, 0.5);
	border-radius: 3px;
}
</style>
