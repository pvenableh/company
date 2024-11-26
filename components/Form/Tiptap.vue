<template>
	<div v-if="editor" class="tiptap-wrapper relative">
		<editor-content
			:editor="editor"
			class="rounded-t-md border-t border-r border-l dark:text-white text-[14px] transition-all duration-200 overflow-y-scroll focus:border focus:border-cyan-200 relative tiptap-container"
			:class="[
				{ 'px-0 pt-0 border-none': disabled },
				{ ' border-cyan-200': editor.isFocused },
				{ 'border-b rounded-b-md': !showToolbar },
				height,
				customClasses,
			]"
		/>

		<div
			v-if="showToolbar"
			class="w-full flex flex-row justify-between rounded-b-md border-r border-l border-b"
			:class="{ ' border-cyan-200': editor.isFocused }"
		>
			<div>
				<UButton
					v-for="(button, index) in toolbarButtons"
					:key="index"
					size="xs"
					variant="ghost"
					:icon="button.icon"
					:class="{ 'is-active': editor.isActive(button.command) }"
					@click="button.action"
				/>
			</div>
			<UButton
				@click="$refs.fileInput.click()"
				size="xs"
				variant="ghost"
				icon="i-heroicons-paper-clip"
				class="px-1 mr-2"
			/>
			<input ref="fileInput" type="file" multiple class="hidden" @change="handleFileUpload" />
		</div>

		<UProgress v-if="isUploading" :value="uploadProgress" color="primary" class="mt-2" />
		<div ref="mentionsPortal" class="mentions-portal" />
	</div>
</template>

<script setup>
import StarterKit from '@tiptap/starter-kit';
import { Editor, EditorContent } from '@tiptap/vue-3';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Mention } from '@tiptap/extension-mention';

const props = defineProps({
	modelValue: {
		type: String,
		default: '',
	},
	showToolbar: {
		type: Boolean,
		default: true,
	},
	height: {
		type: String,
		default: 'min-h-20',
	},
	singleLine: {
		type: Boolean,
		default: false,
	},
	customClasses: {
		type: String,
		default: 'p-4',
	},
	focusRingClasses: {
		type: String,
		default: 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900 border-cyan-200',
	},
	disabled: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:modelValue', 'mention', 'blur', 'enter']);

const editor = ref(null);
const fileInput = ref(null);
const isUploading = ref(false);
const uploadProgress = ref(0);
const { uploadFiles } = useDirectusFiles();
const { readUsers } = useDirectusUsers();
const { notify } = useNotifications();
const { user: currentUser } = useDirectusAuth();
const toast = useToast();

const mentionsPortal = ref(null);

const toolbarButtons = [
	{ icon: 'i-heroicons-bold', command: 'bold', action: () => editor.value.chain().focus().toggleBold().run() },
	{ icon: 'i-heroicons-italic', command: 'italic', action: () => editor.value.chain().focus().toggleItalic().run() },
	{
		icon: 'i-heroicons-strikethrough',
		command: 'strike',
		action: () => editor.value.chain().focus().toggleStrike().run(),
	},
	{
		icon: 'i-heroicons-list-bullet',
		command: 'bulletList',
		action: () => editor.value.chain().focus().toggleBulletList().run(),
	},
	{
		icon: 'i-heroicons-numbered-list',
		command: 'orderedList',
		action: () => editor.value.chain().focus().toggleOrderedList().run(),
	},
];

// const handleUserMention = async (mentionedUser) => {
// 	if (!mentionedUser || !props.context.collection || !props.context.itemId) return;

// 	try {
// 		const contextInfo = {
// 			collection: props.context.collection,
// 			item: props.context.itemId,
// 		};

// 		const notice =await notify({
// 			recipient: mentionedUser.id,
// 			subject: 'You were mentioned',
// 			message: `${currentUser.value?.first_name} ${currentUser.value?.last_name} mentioned you in a ${contextInfo.collection.slice(0, -1)}`,
// 			...contextInfo,
// 		});
// 	} catch (error) {
// 		console.error('Error sending mention notification:', error);
// 		toast.add({
// 			title: 'Error',
// 			description: 'Failed to notify mentioned user',
// 			color: 'red',
// 		});
// 	}
// };

const CustomMention = Mention.configure({
	HTMLAttributes: {
		class: 'mention',
	},
	suggestion: {
		char: '@',
		items: async ({ query }) => {
			try {
				const users = await readUsers({
					fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
					search: query,
				});

				return users.map((user) => ({
					id: user.id,
					label: `${user.first_name} ${user.last_name}`,
					email: user.email,
					avatar: user.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small` : null,
				}));
			} catch (error) {
				console.error('Error fetching users:', error);
				return [];
			}
		},
		render: () => {
			let popup = null;
			let selectedIndex = 0;
			let mentionRange = null;
			let currentItems = [];
			let currentClientRect = null;

			const positionPopup = (coords) => {
				if (!popup || !mentionsPortal.value) return;

				const editorRect = mentionsPortal.value.getBoundingClientRect();
				const viewportHeight = window.innerHeight;

				let left = coords.left - editorRect.left;
				let top = coords.bottom - editorRect.top;

				if (coords.bottom + popup.offsetHeight > viewportHeight) {
					top = coords.top - editorRect.top - popup.offsetHeight;
				}

				const maxLeft = editorRect.width - popup.offsetWidth;
				left = Math.max(0, Math.min(left, maxLeft));

				popup.style.transform = `translate3d(${left}px, ${top}px, 0)`;
			};

			const renderItems = (items) => {
				currentItems = items;
				if (!popup) return;

				popup.innerHTML = `
					<div class="max-h-48 overflow-y-auto py-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700">
						${items
							.map(
								(item, index) => `
							<div class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 ${
								index === selectedIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
							}" data-index="${index}">
								<img src="${item.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.label)}&background=eeeeee&color=00bfff`}" 
									class="w-8 h-8 rounded-full" alt="${item.label}">
								<div>
									<div class="font-medium text-sm">${item.label}</div>
									<div class="text-xs text-gray-500">${item.email}</div>
								</div>
							</div>
						`,
							)
							.join('')}
					</div>
				`;

				if (currentClientRect) {
					positionPopup(currentClientRect());
				}
			};

			return {
				onStart: ({ items, clientRect, range }) => {
					selectedIndex = 0;
					mentionRange = range;
					currentClientRect = clientRect;

					if (!popup) {
						popup = document.createElement('div');
						popup.classList.add('mentions-menu');
						mentionsPortal.value?.appendChild(popup);

						popup.addEventListener('click', (e) => {
							const item = e.target.closest('[data-index]');
							if (item) {
								selectedIndex = parseInt(item.dataset.index);
								const selectedItem = currentItems[selectedIndex];
								if (selectedItem && editor.value) {
									editor.value
										.chain()
										.focus()
										.deleteRange(mentionRange)
										.insertContentAt(mentionRange.from, [
											{
												type: 'mention',
												attrs: {
													id: selectedItem.id,
													label: selectedItem.label,
												},
											},
											{ type: 'text', text: ' ' },
										])
										.run();
									popup?.remove();
									popup = null;
								}
							}
						});
					}

					renderItems(items);
					const coords = clientRect();
					if (coords) {
						positionPopup(coords);
					}
				},

				onUpdate: ({ items, clientRect, range }) => {
					selectedIndex = 0;
					mentionRange = range;
					currentClientRect = clientRect;
					renderItems(items);
					const coords = clientRect();
					if (coords) {
						positionPopup(coords);
					}
				},

				onKeyDown: ({ event }) => {
					if (!popup) return false;

					if (event.key === 'ArrowUp') {
						selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
						renderItems(currentItems);
						return true;
					}

					if (event.key === 'ArrowDown') {
						selectedIndex = (selectedIndex + 1) % currentItems.length;
						renderItems(currentItems);
						return true;
					}

					if (event.key === 'Enter' && currentItems[selectedIndex]) {
						event.preventDefault();
						const selectedItem = currentItems[selectedIndex];
						if (selectedItem && editor.value) {
							editor.value
								.chain()
								.focus()
								.deleteRange(mentionRange)
								.insertContentAt(mentionRange.from, [
									{
										type: 'mention',
										attrs: {
											id: selectedItem.id,
											label: selectedItem.label,
										},
									},
									{ type: 'text', text: ' ' },
								])
								.run();

							// // Handle mention notifications
							// handleUserMention(selectedItem);
							emit('mention', selectedItem);

							popup?.remove();
							popup = null;
						}
						return true;
					}

					return false;
				},

				onExit: () => {
					popup?.remove();
					popup = null;
					mentionRange = null;
					currentItems = [];
					selectedIndex = 0;
					currentClientRect = null;
				},
			};
		},
	},
});

const FileUpload = Extension.create({
	name: 'fileUpload',
	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					handleDrop: (view, event) => {
						const hasFiles = event.dataTransfer?.files?.length;
						if (!hasFiles) return false;
						event.preventDefault();
						handleFiles(Array.from(event.dataTransfer.files));
						return true;
					},
				},
			}),
		];
	},
});

const handleFileUpload = async (event) => {
	const files = Array.from(event.target.files);
	await handleFiles(files);
	event.target.value = '';
};

const handleFiles = async (files) => {
	if (!files.length) return;

	isUploading.value = true;
	uploadProgress.value = 0;

	try {
		const formData = new FormData();
		const folderId = '50aebdbd-1c67-4fae-8f56-8895b1b4c0cc';

		files.forEach((file, index) => {
			formData.append(`title_${index}`, file.name);
			formData.append(`type_${index}`, file.type);
			formData.append(`folder_${index}`, folderId);
			formData.append('file', file, file.name);
		});

		const result = await uploadFiles(formData);
		const uploadedFiles = Array.isArray(result) ? result : [result];

		uploadedFiles.forEach((file) => {
			const fileUrl = `${useRuntimeConfig().public.directusUrl}/assets/${file.id}`;
			if (file.type.startsWith('image/')) {
				editor.value.chain().focus().setImage({ src: fileUrl }).run();
			} else {
				editor.value.chain().focus().setLink({ href: fileUrl }).insertContent(file.filename_download).run();
			}
		});
	} catch (error) {
		console.error('Upload failed:', error);
		toast.add({
			title: 'Error',
			description: error.message || 'Failed to upload files',
			color: 'red',
		});
	} finally {
		isUploading.value = false;
	}
};

watch(
	() => props.modelValue,
	(value) => {
		if (editor.value && editor.value.getHTML() !== value) {
			editor.value.commands.setContent(value, false);
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

onMounted(() => {
	editor.value = new Editor({
		extensions: [StarterKit, Link, Image, FileUpload, CustomMention],
		content: props.modelValue,
		editable: !props.disabled,
		onUpdate: () => {
			emit('update:modelValue', editor.value.getHTML());
		},
		onBlur: ({ event }) => {
			emit('blur', event);
		},
		onKeyDown: ({ event }) => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				emit('enter', event);
				return true;
			}
		},
	});
});

onBeforeUnmount(() => {
	editor.value?.destroy();
});
</script>

<style>
.tiptap {
	> * + * {
		margin-top: 0.75em;
	}

	h1 {
		font-size: 18px;
	}
	h2 {
		font-size: 16px;
	}

	strong {
		font-weight: 900;
		font-family: var(--font-bold);
	}

	ul,
	ol {
		list-style-type: disc;
		padding: 0 1rem;
	}

	blockquote {
		padding-left: 1rem;
		border-left: 2px solid rgba(#0d0d0d, 0.1);
	}

	img {
		max-width: 100%;
		height: auto;
		margin: 1rem 0;
	}

	a {
		color: #0074d9;
		text-decoration: underline;
		&:hover {
			color: #004b8c;
		}
	}

	.mention {
		color: #0074d9;
		font-weight: 500;
		background: rgba(0, 116, 217, 0.1);
		padding: 0.2em 0.4em;
		border-radius: 0.3em;
		text-decoration: none;
		white-space: nowrap;
	}
	&:focus-within {
		outline: none;
	}

	/* Add a smooth transition for the focus effect */
	&,
	&.ProseMirror {
		transition: all 0.2s ease-in-out;
	}

	/* Optional: Add a subtle hover effect */
	&:not(.ProseMirror-focused):hover {
		border-color: var(--cyan-200);
	}
}

.tiptap-container:focus-within + div button {
	@apply text-primary-500;
}

/* Ensure proper contrast in dark mode */
.dark .tiptap-container:focus-within {
	@apply border-cyan-200;
}

.is-active {
	background-color: rgba(0, 0, 0, 0.1);
}

.tiptap-wrapper {
	position: relative;
}

.mentions-portal {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 0;
	pointer-events: none;
	z-index: 50;
}

.mentions-menu {
	position: absolute;
	pointer-events: auto;
	width: 16rem;
	z-index: 50;
	transform: translate3d(0, 0, 0);
	will-change: transform;
}
</style>
