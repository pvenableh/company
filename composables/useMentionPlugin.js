import { ref, watch } from 'vue';
import { useEditor, Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { useDirectusUsers } from '@directus/sdk';

export function useMentionPlugin(content) {
	const directusUsers = useDirectusUsers();
	const suggestions = ref([]);

	const fetchUsers = async (query) => {
		try {
			const users = await directusUsers.readMany({
				search: query,
				fields: ['id', 'first_name', 'last_name', 'email'],
			});

			suggestions.value = users.map((user) => ({
				id: user.id,
				label: `${user.first_name} ${user.last_name}`,
				email: user.email,
			}));
		} catch (error) {
			console.error('Error fetching users:', error);
			suggestions.value = [];
		}
	};

	const editor = useEditor({
		content: content.value,
		extensions: [
			StarterKit,
			Mention.configure({
				HTMLAttributes: {
					class: 'mention',
				},
				suggestion: {
					items: ({ query }) => {
						fetchUsers(query);
						return suggestions.value;
					},
					render: () => {
						// Implementation of mention suggestion rendering
						// Using NuxtUI's dropdown for suggestions
						return {
							onStart: (props) => {
								// Show suggestion dropdown
							},
							onUpdate(props) {
								// Update suggestions
							},
							onKeyDown(props) {
								// Handle keyboard navigation
							},
							onExit() {
								// Clean up
							},
						};
					},
				},
			}),
		],
		onUpdate: ({ editor }) => {
			content.value = editor.getHTML();
		},
	});

	watch(content, (newContent) => {
		if (editor.value && newContent !== editor.value.getHTML()) {
			editor.value.commands.setContent(newContent);
		}
	});

	return {
		editor,
		suggestions,
	};
}
