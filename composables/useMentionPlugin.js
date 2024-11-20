import { ref, watch } from 'vue';
import { useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { createDirectus, rest, readUsers } from '@directus/sdk';
import { useRuntimeConfig } from '#imports';

export function useMentionPlugin(content, options = {}) {
	const config = useRuntimeConfig();
	const suggestions = ref([]);
	const showSuggestions = ref(false);
	const suggestionPosition = ref({ x: 0, y: 0 });
	const selectedIndex = ref(0);
	const isLoading = ref(false);
	const error = ref(null);

	// Initialize Directus client
	const client = createDirectus(config.public.directusUrl).with(rest());

	// Debounce function
	const debounce = (func, wait) => {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	};

	// Fetch users from Directus with improved error handling and search
	const fetchUsers = async (query) => {
		if (!query || query.length < 2) {
			suggestions.value = [];
			return;
		}

		try {
			isLoading.value = true;
			error.value = null;

			const filter = {
				_or: [
					{ first_name: { _contains: query } },
					{ last_name: { _contains: query } },
					{ email: { _contains: query } },
				],
			};

			const response = await readUsers(client, {
				fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
				filter,
				limit: options.limit || 5,
				sort: ['first_name'],
			});

			// Check if response has data property (for older Directus versions)
			const users = Array.isArray(response) ? response : response.data;

			if (!Array.isArray(users)) {
				console.error('Unexpected response format:', users);
				suggestions.value = [];
				return;
			}

			suggestions.value = users.map((user) => ({
				id: user.id,
				label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
				email: user.email,
				avatar: user.avatar ? `${config.public.directusUrl}/assets/${user.avatar}?key=small` : null,
			}));
		} catch (err) {
			console.error('Error fetching users:', err);
			error.value = err.message;
			suggestions.value = [];
		} finally {
			isLoading.value = false;
		}
	};

	// Debounced version of fetchUsers
	const debouncedFetchUsers = debounce(fetchUsers, 300);

	const editor = useEditor({
		content: content.value,
		extensions: [
			StarterKit,
			Mention.configure({
				HTMLAttributes: {
					class: 'mention',
					'data-user-id': null,
				},
				renderLabel({ options, node }) {
					return `@${options.suggestion.char}${node.attrs.label}`;
				},
				suggestion: {
					char: '@',
					allowSpaces: true,
					items: async ({ query }) => {
						await debouncedFetchUsers(query);
						return suggestions.value;
					},
					render: () => {
						let command;

						return {
							onStart: (props) => {
								showSuggestions.value = true;
								command = props.command;
								selectedIndex.value = 0;

								// Calculate dropdown position with viewport boundary checking
								const rect = props.clientRect();
								if (rect) {
									const { left, bottom } = rect;
									const dropdownHeight = 200; // Approximate height of dropdown
									const viewportHeight = window.innerHeight;

									suggestionPosition.value = {
										x: Math.min(left, window.innerWidth - 300), // Prevent overflow right
										y:
											bottom + window.scrollY > viewportHeight - dropdownHeight
												? rect.top + window.scrollY - dropdownHeight // Show above if not enough space below
												: bottom + window.scrollY,
									};
								}
							},

							onUpdate(props) {
								command = props.command;
								const rect = props.clientRect();
								if (rect) {
									suggestionPosition.value = {
										x: Math.min(rect.left, window.innerWidth - 300),
										y: rect.bottom + window.scrollY,
									};
								}
							},

							onKeyDown: (props) => {
								if (!showSuggestions.value) return false;

								// Handle keyboard navigation
								switch (props.event.key) {
									case 'ArrowUp':
										props.event.preventDefault();
										selectedIndex.value =
											(selectedIndex.value - 1 + suggestions.value.length) % suggestions.value.length;
										return true;

									case 'ArrowDown':
										props.event.preventDefault();
										selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length;
										return true;

									case 'Enter':
									case 'Tab':
										props.event.preventDefault();
										const selectedUser = suggestions.value[selectedIndex.value];
										if (selectedUser) {
											command({
												id: selectedUser.id,
												label: selectedUser.label,
												'data-user-id': selectedUser.id,
											});
										}
										showSuggestions.value = false;
										return true;

									case 'Escape':
										props.event.preventDefault();
										showSuggestions.value = false;
										return true;

									default:
										return false;
								}
							},

							onExit: () => {
								showSuggestions.value = false;
								selectedIndex.value = 0;
								error.value = null;
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

	// Cleanup function
	const destroy = () => {
		if (editor.value) {
			editor.value.destroy();
		}
	};

	return {
		editor,
		suggestions,
		showSuggestions,
		suggestionPosition,
		selectedIndex,
		isLoading,
		error,
		destroy,
	};
}
