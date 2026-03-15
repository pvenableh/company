<template>
	<div v-if="editor" class="tiptap-wrapper relative">
		<!-- Drop zone overlay that appears when dragging files -->
		<div
			v-if="isDragging"
			class="absolute inset-0 bg-cyan-50 dark:bg-cyan-900/20 border-2 border-dashed border-cyan-300 dark:border-cyan-600 rounded z-10 flex items-center justify-center pointer-events-none"
		>
			<div class="text-center">
				<UIcon name="i-heroicons-arrow-down-tray" class="w-12 h-12 text-cyan-500 mb-2" />
				<p class="text-cyan-600 dark:text-cyan-300 font-medium">Drop files to upload</p>
			</div>
		</div>

		<editor-content
			:editor="editor"
			class="border-gray-300 border-t border-r border-l dark:text-white text-[14px] transition-all duration-200 overflow-y-scroll focus:border focus:border-cyan-200 relative tiptap-container rounded-t"
			:class="[
				{ 'px-0 pt-0 border-none': disabled },
				{ ' !border-cyan-200': editor.isFocused },
				{ 'border-b rounded-b': !showToolbar },
				height,
				customClasses,
			]"
			@dragenter.prevent="handleDragEnter"
			@dragover.prevent="handleDragOver"
			@dragleave.prevent="handleDragLeave"
			@drop.prevent="handleDrop"
		/>

		<div
			v-if="showToolbar"
			class="w-full flex flex-row justify-between border-gray-300 border-r border-l border-b toolbar rounded-b"
			:class="{ ' !border-cyan-200': editor.isFocused }"
		>
			<div class="flex items-center flex-row">
				<UButton
					@click="$refs.fileInput.click()"
					size="xs"
					variant="ghost"
					icon="i-heroicons-paper-clip"
					class="ml-2 px-1 transform scale-[0.85]"
				/>
				<input ref="fileInput" type="file" multiple class="hidden" @change="handleFileUpload" />
				<UButton
					v-for="(button, index) in toolbarButtons"
					:key="index"
					size="xs"
					variant="ghost"
					:icon="button.icon"
					class="transform scale-[0.8]"
					:class="{ 'is-active': editor.isActive(button.command) }"
					@click="button.action"
				/>
				<UPopover :popper="{ placement: 'bottom-start' }" mode="click">
					<UButton
						size="xs"
						variant="ghost"
						:icon="'i-heroicons-link'"
						class="transform scale-75"
						:class="{ 'is-active': editor.isActive('link') }"
					/>
					<template #panel="{ close }">
						<div class="p-2 w-72 space-y-4">
							<UFormGroup label="URL">
								<UInput v-model="linkUrl" placeholder="https://example.com" @keyup.enter="setLink(close)" />
							</UFormGroup>
							<div class="flex justify-end space-x-2">
								<UButton v-if="editor.isActive('link')" size="xs" color="red" variant="soft" @click="removeLink(close)">
									Remove
								</UButton>
								<UButton size="xs" color="primary" @click="setLink(close)">
									{{ editor.isActive('link') ? 'Update' : 'Add' }}
								</UButton>
							</div>
						</div>
					</template>
				</UPopover>
			</div>
			<div v-if="showCharCount" class="absolute -bottom-[20px] right-0">
				<!-- Character count display -->
				<span
					class="text-[10px]"
					:class="{
						'text-red-500': characterCount > characterLimit && characterLimit > 0,
						'text-gray-500': characterCount <= characterLimit || characterLimit === 0,
					}"
				>
					{{ characterCount }} / {{ characterLimit }}
				</span>
			</div>
		</div>

		<!-- Upload Progress Bar -->
		<div v-if="isUploading" class="mt-2">
			<UProgress :value="uploadProgress" color="primary" size="xs" />
			<p class="text-xs text-gray-500 text-center mt-1">Uploading {{ currentFile }}</p>
		</div>

		<div ref="mentionsPortal" class="mentions-portal" />
		<UModal v-model="isModalOpen" fullscreen>
			<div class="relative">
				<UButton
					class="absolute top-2 right-2 z-10"
					color="gray"
					variant="outline"
					icon="i-heroicons-x-mark"
					:ui="{ rounded: 'rounded-full' }"
					@click="closeModal"
				/>
				<transition name="fade">
					<img
						v-if="currentImageSrc"
						:src="currentImageSrc"
						alt="Expanded view"
						class="w-full h-auto max-h-screenrounded-none object-contain"
					/>
				</transition>
			</div>
		</UModal>
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
import { useFilteredUsers } from '~/composables/useFilteredUsers';
import CharacterCount from '@tiptap/extension-character-count';
import { useFileUpload } from '~/composables/useFileUpload';

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
		default: 'ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-900 border-[var(--cyan)]',
	},
	disabled: {
		type: Boolean,
		default: false,
	},
	organizationId: {
		type: String,
		default: null,
	},
	teamId: {
		type: String,
		default: null,
	},
	clientId: {
		type: String,
		default: null,
	},
	context: {
		type: Object,
		default: () => ({
			collection: null,
			itemId: null,
		}),
	},
	characterLimit: {
		type: Number,
		default: 1000, // 0 means no limit
	},
	showCharCount: {
		type: Boolean,
		default: true,
	},
	allowUploads: {
		type: Boolean,
		default: true,
	},
	enterToSend: {
		type: Boolean,
		default: false,
	},
});

// Modal state
const isModalOpen = ref(false);
const currentImageSrc = ref('');

// Drag and drop state
const isDragging = ref(false);
const dragCounter = ref(0);

const closeModal = () => {
	isModalOpen.value = false;
	currentImageSrc.value = '';
};

const emit = defineEmits([
	'update:modelValue',
	'mention',
	'blur',
	'enter',
	'submit',
	'upload-start',
	'upload-complete',
	'upload-error',
	'limitExceeded',
]);

const editor = ref(null);
const fileInput = ref(null);
const linkUrl = ref('');
const { uploadFiles, updateFile } = useDirectusFiles();
const { notify } = useNotifications();
const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { selectedOrg } = useOrganization();
const { selectedTeam } = useTeams();
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const {
	validateFiles,
	processUpload,
	uploadFilesWithProgress,
	startUpload,
	setProgress,
	resetUploadState,
	setCurrentFile,
	sanitizeFilename,
	isUploading, // Readonly
	uploadProgress, // Readonly
	currentFile, // Readonly
	formatFileSize,
} = useFileUpload();

const toast = useToast();
const mentionsPortal = ref(null);

// Handling drag and drop events
const handleDragEnter = (event) => {
	if (props.disabled || !props.allowUploads) return;
	dragCounter.value++;
	if (hasFiles(event)) {
		isDragging.value = true;
	}
};

const handleDragOver = (event) => {
	if (props.disabled || !props.allowUploads) return;
	if (hasFiles(event)) {
		event.dataTransfer.dropEffect = 'copy';
		isDragging.value = true;
	}
};

const handleDragLeave = (event) => {
	if (props.disabled) return;
	dragCounter.value--;
	if (dragCounter.value <= 0) {
		isDragging.value = false;
		dragCounter.value = 0;
	}
};

const handleDrop = (event) => {
	if (props.disabled || !props.allowUploads) return;
	isDragging.value = false;
	dragCounter.value = 0;

	if (hasFiles(event)) {
		const files = Array.from(event.dataTransfer.files);
		handleFiles(files);
	}
};

// Check if the event contains files
const hasFiles = (event) => {
	if (!import.meta.client) return false;
	if (!event.dataTransfer?.types) return false;
	return event.dataTransfer.types.includes('Files');
};

const setLink = (close) => {
	if (linkUrl.value) {
		editor.value.chain().focus().setLink({ href: linkUrl.value, target: '_blank' }).run();
	}
	linkUrl.value = '';
	close();
};

const removeLink = (close) => {
	editor.value.chain().focus().unsetLink().run();
	linkUrl.value = '';
	close();
};

// Update linkUrl when a link is selected
const updateLinkUrl = () => {
	const link = editor.value?.getAttributes('link');
	linkUrl.value = link?.href || '';
};

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

const handleUserMention = async (mentionedUser) => {
	if (!mentionedUser || !props.context.collection || !props.context.itemId) return;
	console.log('Sending mention notification to:', mentionedUser);

	const route = useRoute();
	const currentUrl = `https://huestudios.company/${route.fullPath}`;

	try {
		const contextInfo = {
			collection: props.context.collection,
			item: props.context.itemId,
		};

		const notice = await notify({
			recipient: mentionedUser.id,
			sender: currentUser.value?.id,
			subject: 'You were mentioned',
			message: `${currentUser.value?.first_name} ${currentUser.value?.last_name} mentioned you in a ${contextInfo.collection.slice(
				0,
				-1,
			)}. <br><a href='${currentUrl}'>View ${contextInfo.collection.slice(0, -1)}</a>`,
			...contextInfo,
		});
		console.log('Mention notification sent:', notice);
	} catch (error) {
		console.error('Error sending mention notification:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to notify mentioned user',
			color: 'red',
		});
	}
};

const CustomMention = Mention.configure({
	HTMLAttributes: {
		class: 'mention',
	},
	suggestion: {
		char: '@',
		items: async ({ query }) => {
			if (!currentUser.value) return [];

			try {
				// Determine which org/team/client to use (props take precedence over global state)
				const orgId = props.organizationId || selectedOrg.value;
				const teamId = props.teamId || selectedTeam.value;
				const clientId = props.clientId || null;

				// Fetch users based on organization, team, and client context
				await fetchFilteredUsers(orgId, teamId, clientId);

				// Filter out the current user and apply the search query
				const mentionUsers = filteredUsers.value
					.filter((user) => user.id !== currentUser.value.id)
					.filter((user) => {
						const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
						return fullName.includes(query.toLowerCase());
					})
					.map((user) => ({
						id: user.id,
						label: `${user.first_name} ${user.last_name}`,
						email: user.email,
						avatar: user.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small` : null,
						type: user.type || 'internal',
						clientName: user.clientName || null,
					}));

				return mentionUsers;
			} catch (error) {
				console.error('Error in mentions query:', error);
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
	${
		items.length === 0
			? '<div class="px-3 py-2 text-gray-500">No users found</div>'
			: items
					.map(
						(item, index) => `
	<div class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2 ${
		index === selectedIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
	}" data-index="${index}">
	  <img src="${
			item.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.label)}&background=eeeeee&color=00bfff`
		}"
	  class="w-8 h-8 rounded-full" alt="${item.label}">
	  <div class="flex-1 min-w-0">
	  <div class="font-medium text-sm flex items-center gap-1.5">${item.label}${
			item.type === 'client'
				? `<span class="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:text-blue-300">${item.clientName || 'Client'}</span>`
				: ''
		}</div>
	  <div class="text-xs text-gray-500 truncate">${item.email}</div>
	  </div>
	</div>
	`,
					)
					.join('')
	}
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
									handleUserMention(selectedItem);
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
									emit('mention', selectedItem);
									popup?.remove();
									popup = null;
								}
							}
						});
					}

					renderItems(items);
					const coords = clientRect?.(); // Use optional chaining
					if (!coords) return;
					positionPopup(coords);
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

						// Scroll the selected item into view
						const selectedElement = popup.querySelector(`[data-index="${selectedIndex}"]`);
						const container = popup.querySelector('.max-h-48');
						if (selectedElement && container) {
							if (selectedElement.offsetTop < container.scrollTop) {
								container.scrollTop = selectedElement.offsetTop;
							}
						}
						return true;
					}

					if (event.key === 'ArrowDown') {
						selectedIndex = (selectedIndex + 1) % currentItems.length;
						renderItems(currentItems);

						// Scroll the selected item into view
						const selectedElement = popup.querySelector(`[data-index="${selectedIndex}"]`);
						const container = popup.querySelector('.max-h-48');
						if (selectedElement && container) {
							const elementBottom = selectedElement.offsetTop + selectedElement.offsetHeight;
							const containerBottom = container.scrollTop + container.offsetHeight;

							if (elementBottom > containerBottom) {
								container.scrollTop = elementBottom - container.offsetHeight;
							}
						}
						return true;
					}

					if (event.key === 'Enter' && currentItems[selectedIndex]) {
						event.preventDefault();
						const selectedItem = currentItems[selectedIndex];
						if (selectedItem && editor.value) {
							handleUserMention(selectedItem);
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

const CustomImage = Image.extend({
	addAttributes() {
		return {
			...Image.config.addAttributes(),
			src: {
				default: null,
				parseHTML: (element) => element.getAttribute('src'),
			},
		};
	},
	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					handleClick: (view, pos, event) => {
						const node = view.state.doc.nodeAt(pos);
						if (node?.type.name === 'image') {
							event.preventDefault();
							// Using the global refs since we can't access component's scope here
							currentImageSrc.value = node.attrs.src;
							isModalOpen.value = true;
							return true;
						}
						return false;
					},
				},
			}),
		];
	},
});

const FileUpload = Extension.create({
	name: 'fileUpload',
	addProseMirrorPlugins() {
		// We don't need this plugin anymore since we're handling the drop events at the Vue component level
		return [];
	},
});

const handleFileUpload = async (event) => {
	const files = Array.from(event.target.files);
	await handleFiles(files);
	event.target.value = '';
};

const characterCount = computed(() => {
	return editor.value?.storage.characterCount.characters() ?? 0;
});

onMounted(() => {
	editor.value = new Editor({
		extensions: [
			StarterKit,
			Link.configure({
				openOnClick: true,
				HTMLAttributes: {
					target: '_blank',
					rel: 'noopener noreferrer',
				},
			}),
			CustomImage,
			FileUpload,
			CustomMention,
			CharacterCount,
		],
		content: props.modelValue,
		editable: !props.disabled,
		onUpdate: () => {
			if (editor.value) {
				const content = editor.value.getHTML();
				const currentCount = editor.value.storage.characterCount.characters();
				const isExceeded = props.characterLimit > 0 && currentCount > props.characterLimit;
				emit('update:modelValue', content);
				emit('limitExceeded', isExceeded);
			}
		},
		onBlur: ({ event }) => {
			emit('blur', event);
		},
		onKeyDown: ({ event }) => {
			if (event.key === 'Enter' && !event.shiftKey && props.singleLine) {
				event.preventDefault();
				emit('enter', event);
				return true;
			}
			// Enter to send: when enabled, plain Enter emits submit (Shift+Enter still creates newline)
			if (event.key === 'Enter' && !event.shiftKey && props.enterToSend) {
				event.preventDefault();
				emit('submit');
				return true;
			}
		},
		onSelectionUpdate: () => {
			updateLinkUrl();
		},
	});

	// Initial load of filtered users based on current organization, team, and client context
	const orgId = props.organizationId || selectedOrg.value;
	const teamId = props.teamId || selectedTeam.value;
	const clientId = props.clientId || null;

	if (orgId) {
		fetchFilteredUsers(orgId, teamId, clientId);
	}
});

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

// Watch for teamId, organizationId, or clientId changes to refresh the filtered users
watch(
	[() => props.teamId, () => props.organizationId, () => props.clientId, () => selectedOrg.value, () => selectedTeam.value],
	async ([newTeamId, newOrgId, newClientId, newSelectedOrg, newSelectedTeam]) => {
		// Props take precedence over global state
		const orgId = newOrgId || newSelectedOrg;
		const teamId = newTeamId || newSelectedTeam;
		const clientId = newClientId || null;

		if (orgId) {
			await fetchFilteredUsers(orgId, teamId, clientId);
		}
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	editor.value?.destroy();
});

// This updated handleFiles function for Form/Tiptap.vue integrates
// with the enhanced useFileUpload composable

const handleFiles = async (files) => {
	if (!import.meta.client || !files.length) return;
	if (!files.length) return;

	if (isUploading.value) {
		toast.add({
			title: 'Upload in Progress',
			description: 'Another upload is already in progress.',
			color: 'yellow',
		});
		return;
	}

	try {
		emit('upload-start');
		resetUploadState();
		startUpload();

		const folderId = '50aebdbd-1c67-4fae-8f56-8895b1b4c0cc'; // Your folder ID

		// Process files with enhanced validation and compression
		const { success, formData, processedFilesInfo, errors, warnings } = await processUpload(files, {
			compressImages: true,
		});

		if (!success) {
			toast.add({
				title: 'File Validation Failed',
				description: errors.join('\n'),
				color: 'red',
				timeout: 5000,
			});
			resetUploadState();
			return;
		}

		// Show warnings if any (like compression info)
		if (warnings && warnings.length > 0) {
			toast.add({
				title: 'File Processing Notes',
				description: warnings.join('\n'),
				color: 'blue',
				timeout: 5000,
			});
		}

		try {
			const uploadResults = await uploadFilesWithProgress(formData, setProgress);
			const uploadedFiles = Array.isArray(uploadResults) ? uploadResults : [uploadResults];

			if (uploadedFiles.length === 0) {
				throw new Error('No files were uploaded');
			}

			// Update folder for uploaded files
			const updatePromises = uploadedFiles.map(async (file) => {
				if (!file || !file.id) {
					console.warn('Skipping update: Invalid file or file.id', file);
					return null;
				}

				try {
					const updatedFile = await updateFile(file.id, { folder: folderId });
					return updatedFile;
				} catch (updateError) {
					console.error(`Error updating file ${file.id}:`, updateError);
					return null;
				}
			});

			// Wait for all updates and filter out failed ones
			const updatedFiles = (await Promise.all(updatePromises)).filter(Boolean);

			// Insert each file into the editor
			updatedFiles.forEach((file) => {
				if (!file || !file.id) return;

				const fileUrl = `${useRuntimeConfig().public.directusUrl}/assets/${file.id}`;
				// Insert as image if it's an image type
				if (file.type?.startsWith('image/')) {
					editor.value
						.chain()
						.focus()
						.createParagraphNear()
						.setImage({ src: fileUrl, alt: file.filename_download || 'Uploaded image' })
						.run();
				} else {
					// Insert as link for other file types
					const fileSize = formatFileSize(file.filesize || 0);
					const fileType = file.type || 'document';
					const displayText = `${file.filename_download} (${fileType} - ${fileSize})`;

					editor.value
						.chain()
						.focus()
						.createParagraphNear()
						.insertContent(`<a href="${fileUrl}" target="_blank">${displayText}</a>`)
						.run();
				}
			});

			emit('upload-complete', updatedFiles);
			toast.add({
				title: 'Upload Complete',
				description: `Uploaded ${updatedFiles.length} file(s) successfully`,
				color: 'green',
			});
		} catch (uploadError) {
			console.error('Upload failed:', uploadError);
			emit('upload-error', uploadError);
			toast.add({
				title: 'Upload Failed',
				description: uploadError.message || 'Failed to upload files',
				color: 'red',
			});
		}
	} catch (error) {
		console.error('File handling error:', error);
		toast.add({
			title: 'Error',
			description: error.message || 'Failed to process files',
			color: 'red',
		});
	} finally {
		resetUploadState();
	}
};
</script>

<style>
@reference "~/assets/css/tailwind.css";
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
		@apply font-proxima-regular;
	}

	ul {
		list-style-type: disc;
		padding: 0 1rem;
	}
	ol {
		list-style-type: decimal;
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
	.toolbar {
		button {
			@apply transform scale-75;
		}
	}
	.ProseMirror img {
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.ProseMirror img:hover {
		opacity: 0.9;
	}
}

.tiptap-container:focus-within + div button {
	@apply text-primary;
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

/* Drop zone animation */
@keyframes pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.8;
	}
}

.tiptap-wrapper .absolute {
	animation: pulse 1.5s infinite;
}
</style>
