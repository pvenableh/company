<script setup>
import { Editor, EditorContent, BubbleMenu, VueRenderer } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import Code from '@tiptap/extension-code';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import tippy from 'tippy.js';
import MentionList from '~/components/Channels/MentionList.vue';

const props = defineProps({
	modelValue: {
		type: String,
		default: '',
	},
	disabled: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:modelValue']);
const editor = ref(null);
const { readUsers } = useDirectusUsers();
const users = ref([]);
const showLinkInput = ref(false);

// Link handling
const setLink = () => {
	const previousUrl = editor.value?.getAttributes('link').href;
	const url = window.prompt('URL', previousUrl);

	// cancelled
	if (url === null) {
		return;
	}

	// empty
	if (url === '') {
		editor.value?.chain().focus().extendMarkRange('link').unsetLink().run();
		return;
	}

	// update link
	editor.value?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
};

// Fetch users for mentions
const fetchUsers = async () => {
	try {
		const fetchedUsers = await readUsers({
			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
		});
		users.value = fetchedUsers;
	} catch (error) {
		console.error('Error fetching users:', error);
	}
};

const mentionSuggestion = {
	items: ({ query }) => {
		if (!users.value) return [];
		return users.value
			.filter((user) => {
				const searchStr = `${user.first_name} ${user.last_name}`.toLowerCase();
				return searchStr.includes(query?.toLowerCase() || '');
			})
			.slice(0, 5);
	},

	render: () => {
		let component;
		let popup;

		return {
			onStart: (props) => {
				// Directly reference MentionList, assuming it's auto-imported by Nuxt
				component = new VueRenderer(MentionList, {
					props,
					editor: props.editor,
				});

				if (!props.clientRect) {
					return;
				}

				popup = tippy('body', {
					getReferenceClientRect: props.clientRect,
					appendTo: () => document.body,
					content: component.element,
					showOnCreate: true,
					interactive: true,
					trigger: 'manual',
					placement: 'top-start',
				});
			},

			onUpdate(props) {
				component?.updateProps(props);

				if (!props.clientRect) {
					return;
				}

				popup[0].setProps({
					getReferenceClientRect: props.clientRect,
				});
			},

			onKeyDown(props) {
				if (props.event.key === 'Escape') {
					popup[0].hide();
					return true;
				}

				return component?.ref?.onKeyDown(props);
			},

			onExit() {
				popup[0].destroy();
				component?.destroy();
			},
		};
	},
};

onMounted(async () => {
	await fetchUsers();

	editor.value = new Editor({
		extensions: [
			StarterKit.configure({
				heading: false,
				codeBlock: false,
			}),
			Document,
			Paragraph,
			Code,
			CharacterCount.configure({
				limit: 500,
			}),
			Link.configure({
				openOnClick: false,
				HTMLAttributes: {
					class: 'text-primary-500 hover:underline cursor-pointer',
				},
			}),
			Mention.configure({
				HTMLAttributes: {
					class: 'mention',
				},
				suggestion: mentionSuggestion,
			}),
		],
		content: props.modelValue,
		editable: !props.disabled,
		onUpdate: ({ editor }) => {
			emit('update:modelValue', editor.getHTML());
		},
		editorProps: {
			attributes: {
				class: 'prose prose-sm dark:prose-invert focus:outline-none max-w-none',
			},
		},
	});
});

watch(
	() => props.modelValue,
	(newValue) => {
		if (editor.value && editor.value.getHTML() !== newValue) {
			editor.value.commands.setContent(newValue, false);
		}
	},
);

watch(
	() => props.disabled,
	(newValue) => {
		if (editor.value) {
			editor.value.setEditable(!newValue);
		}
	},
);

onBeforeUnmount(() => {
	editor.value?.destroy();
});
</script>

<template>
	<div class="message-editor relative">
		<BubbleMenu v-if="editor" :editor="editor" :tippy-options="{ duration: 100 }" class="bubble-menu">
			<div
				class="flex items-center gap-1 p-1 rounded-lg border shadow-lg bg-white dark:bg-gray-800 dark:border-gray-700"
			>
				<UButton
					size="xs"
					:color="editor.isActive('bold') ? 'primary' : 'gray'"
					variant="ghost"
					icon="i-heroicons-bold-20-solid"
					@click="editor.chain().focus().toggleBold().run()"
				/>
				<UButton
					size="xs"
					:color="editor.isActive('italic') ? 'primary' : 'gray'"
					variant="ghost"
					icon="i-heroicons-cursor-bar-lines-20-solid"
					@click="editor.chain().focus().toggleItalic().run()"
				/>
				<UButton
					size="xs"
					:color="editor.isActive('strike') ? 'primary' : 'gray'"
					variant="ghost"
					icon="i-heroicons-minus-20-solid"
					@click="editor.chain().focus().toggleStrike().run()"
				/>
				<UButton
					size="xs"
					:color="editor.isActive('code') ? 'primary' : 'gray'"
					variant="ghost"
					icon="i-heroicons-code-bracket-20-solid"
					@click="editor.chain().focus().toggleCode().run()"
				/>
				<div class="w-px h-4 bg-gray-200 dark:bg-gray-700" />
				<UButton
					size="xs"
					:color="editor.isActive('link') ? 'primary' : 'gray'"
					variant="ghost"
					icon="i-heroicons-link-20-solid"
					@click="setLink"
				/>
				<UButton
					v-if="editor.isActive('link')"
					size="xs"
					color="red"
					variant="ghost"
					icon="i-heroicons-x-mark-20-solid"
					@click="editor.chain().focus().unsetLink().run()"
				/>
			</div>
		</BubbleMenu>

		<EditorContent
			:editor="editor"
			class="w-full rounded-md border dark:border-gray-700 px-3 py-2 min-h-[40px]"
			:class="{ 'opacity-50 cursor-not-allowed': disabled }"
		/>
	</div>
</template>

<style>
.message-editor .ProseMirror {
	min-height: 40px;
	outline: none;
	width: 100%;
}

.message-editor .ProseMirror p.is-empty::before {
	color: #adb5bd;
	content: 'Type @ to mention someone...';
	float: left;
	height: 0;
	pointer-events: none;
}

.message-editor .ProseMirror .mention {
	border-radius: 4px;
	padding: 0.1rem 0.3rem;
	background-color: #e9ecef;
	font-weight: 500;
	color: #2d3748;
	white-space: nowrap;
}

/* Formatting styles */
.message-editor .ProseMirror strong {
	font-weight: 600;
}

.message-editor .ProseMirror em {
	font-style: italic;
}

.message-editor .ProseMirror code {
	@apply bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 font-mono text-sm;
}

.message-editor .ProseMirror a {
	@apply text-primary-500 hover:underline cursor-pointer;
}

/* Dark mode */
.dark .message-editor .ProseMirror .mention {
	background-color: #374151;
	color: #e5e7eb;
}

.dark .message-editor .ProseMirror code {
	@apply bg-gray-800 text-gray-200;
}

/* Bubble menu animations */
.bubble-menu {
	transition: opacity 0.2s ease-in-out;
}

.tippy-box[data-animation='fade'][data-state='hidden'] {
	opacity: 0;
}
</style>
