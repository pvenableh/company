import { ref, watch } from 'vue';
import { useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';

export function useMentionPlugin(content) {
	const suggestions = ref([]);
	const showSuggestions = ref(false);
	const suggestionPosition = ref({ x: 0, y: 0 });
	const selectedIndex = ref(0);

	// Fetch users from Directus
	const fetchUsers = async (query) => {
		try {
			const { $directus } = useNuxtApp(); // Access Directus client from Nuxt app

			// Use the `users` endpoint to fetch matching users
			const response = await $directus.users.readByQuery({
				search: query, // Search across user fields (first_name, last_name, etc.)
				fields: ['id', 'first_name', 'last_name', 'email', 'avatar'], // Specify required fields
			});

			// Map the response data to suggestions format
			suggestions.value = (response?.data || []).map((user) => ({
				id: user.id,
				label: `${user.first_name} ${user.last_name}`,
				email: user.email,
				avatar: user.avatar,
			}));
		} catch (error) {
			console.error('Error fetching users:', error);
			suggestions.value = [];
		}
	};

	// Initialize TipTap editor
	const editor = useEditor({
		content: content.value,
		extensions: [
			StarterKit,
			Mention.configure({
				HTMLAttributes: {
					class: 'mention',
				},
				suggestion: {
					items: async ({ query }) => {
						await fetchUsers(query); // Fetch users for the given query
						return suggestions.value;
					},
					render: () => {
						let command;

						return {
							onStart: (props) => {
								showSuggestions.value = true;
								command = props.command;
								selectedIndex.value = 0;

								// Calculate dropdown position
								const rect = props.clientRect();
								if (rect) {
									suggestionPosition.value = {
										x: rect.left,
										y: rect.bottom + window.scrollY,
									};
								}
							},
							onUpdate: (props) => {
								command = props.command;
								const rect = props.clientRect();
								if (rect) {
									suggestionPosition.value = {
										x: rect.left,
										y: rect.bottom + window.scrollY,
									};
								}
							},
							onKeyDown: (props) => {
								if (!showSuggestions.value) return false;

								if (props.event.key === 'ArrowUp') {
									props.event.preventDefault();
									selectedIndex.value = (selectedIndex.value - 1 + suggestions.value.length) % suggestions.value.length;
									return true;
								}

								if (props.event.key === 'ArrowDown') {
									props.event.preventDefault();
									selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length;
									return true;
								}

								if (props.event.key === 'Enter' || props.event.key === 'Tab') {
									props.event.preventDefault();
									const selectedUser = suggestions.value[selectedIndex.value];
									if (selectedUser) {
										command({ id: selectedUser.id, label: selectedUser.label });
									}
									showSuggestions.value = false;
									return true;
								}

								if (props.event.key === 'Escape') {
									props.event.preventDefault();
									showSuggestions.value = false;
									return true;
								}

								return false;
							},
							onExit: () => {
								showSuggestions.value = false;
								selectedIndex.value = 0;
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

	// Sync editor content with the reactive `content` ref
	watch(content, (newContent) => {
		if (editor.value && newContent !== editor.value.getHTML()) {
			editor.value.commands.setContent(newContent);
		}
	});

	return {
		editor,
		suggestions,
		showSuggestions,
		suggestionPosition,
		selectedIndex,
	};
}
