<template>
	<div v-if="editor">
		<bubble-menu class="bubble-menu" :tippy-options="{ duration: 100 }" :editor="editor">
			<button @click="editor.chain().focus().toggleBold().run()" :class="{ 'is-active': editor.isActive('bold') }">
				Bold
			</button>
			<button @click="editor.chain().focus().toggleItalic().run()" :class="{ 'is-active': editor.isActive('italic') }">
				Italic
			</button>
			<button @click="editor.chain().focus().toggleStrike().run()" :class="{ 'is-active': editor.isActive('strike') }">
				Strike
			</button>
		</bubble-menu>
		<floating-menu class="floating-menu" :tippy-options="{ duration: 100 }" :editor="editor">
			<button
				@click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
				:class="{ 'is-active': editor.isActive('heading', { level: 1 }) }"
			>
				H1
			</button>
			<button
				@click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
				:class="{ 'is-active': editor.isActive('heading', { level: 2 }) }"
			>
				H2
			</button>
			<button
				@click="editor.chain().focus().toggleBulletList().run()"
				:class="{ 'is-active': editor.isActive('bulletList') }"
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
<script>
import StarterKit from '@tiptap/starter-kit';
import { BubbleMenu, Editor, EditorContent, FloatingMenu } from '@tiptap/vue-3';

export default {
	components: {
		EditorContent,
		BubbleMenu,
		FloatingMenu,
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

	data() {
		return {
			editor: null,
		};
	},

	watch: {
		modelValue(value) {
			// HTML
			const isSame = this.editor.getHTML() === value;

			// JSON
			// const isSame = JSON.stringify(this.editor.getJSON()) === JSON.stringify(value)

			if (isSame) {
				return;
			}

			this.editor.commands.setContent(value, false);
		},
		disabled(newValue) {
			if (this.editor) {
				this.editor.options.editable = !newValue;
			}
		},
	},

	// watch(() => props.disabled, (newValue) => {
	// 		if (editor.value) {
	// 			editor.value.options.editable = !newValue;
	// 		}
	// 	});

	mounted() {
		this.editor = new Editor({
			extensions: [StarterKit],
			content: this.modelValue,
			editable: !this.disabled,
			onUpdate: () => {
				// HTML
				this.$emit('update:modelValue', this.editor.getHTML());

				// JSON
				// this.$emit('update:modelValue', this.editor.getJSON())
			},
		});
	},

	beforeUnmount() {
		this.editor.destroy();
	},
};
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
</style>
