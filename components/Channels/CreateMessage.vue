<!-- eslint-disable no-console -->
<script>
import { ref, onMounted, watch, computed } from 'vue';
import { Editor, EditorContent, BubbleMenu, FloatingMenu, VueRenderer } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import CharacterCount from '@tiptap/extension-character-count';
import Code from '@tiptap/extension-code';
import Document from '@tiptap/extension-document';
import Mention from '@tiptap/extension-mention';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Link from '@tiptap/extension-link';
import tippy from 'tippy.js';
import MentionList from './MentionList.vue';

export default {
	components: {
		EditorContent,
		BubbleMenu,
		FloatingMenu,
		MentionList,
	},
	props: {
		modelValue: {
			type: String,
			default: '',
		},
		disabled: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['update:modelValue'],
	setup(props, { emit }) {
		const editor = ref(null);
		const limit = ref(200);
		const { readUsers } = useDirectusUsers();
		const showLinkInput = ref(false);
		let allUsers = [];

		const fetchAllUsers = async () => {
			const users = await readUsers({
				fields: 'id, first_name, last_name, email',
			});

			allUsers = users || [];
			console.log(allUsers);
		};

		const fetchUsers = (query) => {
			console.log(query);
			if (!query) return [];
			return allUsers
				.filter((user) => {
					let name = user.first_name + ' ' + user.last_name;
					return name.toLowerCase().includes(query.toLowerCase());
				})
				.map((user) => {
					return user.first_name + ' ' + user.last_name;
				})
				.slice(0, 5);
		};

		const setLink = () => {
			const previousUrl = editor.value.getAttributes('link').href;
			const url = window.prompt('URL', previousUrl);

			// cancelled
			if (url === null) {
				return;
			}

			// empty
			if (url === '') {
				editor.value.chain().focus().extendMarkRange('link').unsetLink().run();

				return;
			}

			// update link
			editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
		};

		const suggestion = {
			items: ({ query }) => fetchUsers(query),
			render: () => {
				let component;
				let popup;

				return {
					onStart: (props) => {
						component = new VueRenderer(MentionList, {
							props,
							editor: props.editor,
						});

						if (!props.clientRect) return;

						popup = tippy('body', {
							getReferenceClientRect: props.clientRect,
							appendTo: () => document.body,
							content: component.element,
							showOnCreate: true,
							interactive: true,
							trigger: 'manual',
							placement: 'bottom-start',
						});
					},
					onUpdate(props) {
						component.updateProps(props);
						if (!props.clientRect) return;
						popup[0].setProps({ getReferenceClientRect: props.clientRect });
					},
					onKeyDown(props) {
						if (props.event.key === 'Escape') {
							popup[0].hide();
							return true;
						}

						return component.ref?.onKeyDown(props);
					},
					onExit() {
						popup[0].destroy();
						component.destroy();
					},
				};
			},
		};

		onMounted(async () => {
			await fetchAllUsers();

			editor.value = new Editor({
				extensions: [
					StarterKit,
					Document,
					Paragraph,
					Text,
					Code,
					CharacterCount.configure({ limit: limit.value }),
					Mention.configure({
						HTMLAttributes: { class: 'mention' },
						suggestion,
					}),
					Link.configure({
						openOnClick: false,
						defaultProtocol: 'https',
					}),
				],
				content: props.modelValue,
				editable: !props.disabled,
				onUpdate: () => {
					emit('update:modelValue', editor.value.getHTML());
				},
			});
		});

		watch(
			() => props.modelValue,
			(value) => {
				const isSame = editor.value.getHTML() === value;

				if (!isSame) {
					editor.value.commands.setContent(value, false);
				}
			},
		);

		watch(
			() => props.disabled,
			(newValue) => {
				if (editor.value) {
					editor.value.options.editable = !newValue;
				}
			},
		);

		const percentage = computed(() =>
			Math.round((100 / limit.value) * editor.value.storage.characterCount.characters()),
		);

		return {
			editor,
			limit,
			percentage,
		};
	},
};
</script>
<template>
	<div
		v-if="editor"
		:class="{
			'character-count': true,
			'character-count--warning': editor.storage.characterCount.characters() === limit,
		}"
	>
		<div class="control-group">
			<div class="button-group">
				<button :class="{ 'is-active': editor.isActive('link') }" @click="setLink">Set link</button>
				<button :disabled="!editor.isActive('link')" @click="editor.chain().focus().unsetLink().run()">
					Unset link
				</button>
			</div>
		</div>
		<bubble-menu class="bubble-menu" :tippy-options="{ duration: 100 }" :editor="editor">
			<button :class="{ 'is-active': editor.isActive('bold') }" @click="editor.chain().focus().toggleBold().run()">
				Bold
			</button>
			<button :class="{ 'is-active': editor.isActive('italic') }" @click="editor.chain().focus().toggleItalic().run()">
				Italic
			</button>
			<button :class="{ 'is-active': editor.isActive('strike') }" @click="editor.chain().focus().toggleStrike().run()">
				Strike
			</button>
			<button :class="{ 'is-active': editor.isActive('link') }" @click="showLinkInput = true">Link</button>
		</bubble-menu>
		<floating-menu class="floating-menu" :tippy-options="{ duration: 100 }" :editor="editor">
			<button
				:class="{ 'is-active': editor.isActive('heading', { level: 1 }) }"
				@click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
			>
				H1
			</button>
			<button
				:class="{ 'is-active': editor.isActive('heading', { level: 2 }) }"
				@click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
			>
				H2
			</button>
			<button
				:class="{ 'is-active': editor.isActive('bulletList') }"
				@click="editor.chain().focus().toggleBulletList().run()"
			>
				Bullet List
			</button>
		</floating-menu>
		<editor-content
			:editor="editor"
			class="rounded-md border p-2 pb-4 dark:text-white text-[14px] min-h-12 transition-all duration-200 tiptap-container"
			:class="{ 'px-0 pt-0 border-none': disabled }"
		/>
	</div>
</template>

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
	.mention {
		background: #dfdfdf;
		@apply rounded px-2 py-1;
	}
}

.bubble-menu {
	display: flex;
	background-color: #0d0d0d;
	padding: 0.2rem;
	border-radius: 0.5rem;
	button {
		border: none;
		background: none;
		color: #fff;
		font-size: 0.85rem;
		font-weight: 500;
		padding: 0 0.2rem;
		opacity: 0.6;
		&:hover,
		&.is-active {
			opacity: 1;
		}
	}
}

.floating-menu {
	display: flex;
	background-color: #0d0d0d10;
	padding: 0.2rem;
	border-radius: 0.5rem;
	button {
		border: none;
		background: none;
		font-size: 0.85rem;
		font-weight: 500;
		padding: 0 0.2rem;
		opacity: 0.6;
		&:hover,
		&.is-active {
			opacity: 1;
		}
	}
}

.dropdown-menu {
	background: var(--white);
	border: 1px solid var(--gray-1);
	border-radius: 0.7rem;
	box-shadow: var(--shadow);
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
	overflow: auto;
	padding: 0.4rem;
	position: relative;
	button {
		align-items: center;
		background-color: transparent;
		display: flex;
		gap: 0.25rem;
		text-align: left;
		width: 100%;
		&:hover,
		&:hover.is-selected {
			background-color: var(--gray-3);
		}
		&.is-selected {
			background-color: var(--gray-2);
		}
	}
}
</style>
