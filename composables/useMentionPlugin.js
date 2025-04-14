import { ref, onMounted } from 'vue';
import { Editor } from '@tiptap/vue-3';
import { StarterKit } from '@tiptap/starter-kit';
import { Mention } from '@tiptap/extension-mention';

export function useMentionPlugin(content) {
	const editor = ref(null);
	const showSuggestions = ref(false);
	const suggestionPosition = ref({ x: 0, y: 0 });
	const suggestions = ref([]);
	const selectedIndex = ref(0);
	const isLoading = ref(false);
	const mentionRange = ref(null);

	const { data, status } = useAuth();
	const currentUser = computed(() => {
		return status.value === 'authenticated' ? data?.value?.user ?? null : null;
	});
	const { readUsers } = useDirectusUsers();

	const selectUser = (user) => {
		if (editor.value && mentionRange.value) {
			editor.value
				.chain()
				.focus()
				.deleteRange(mentionRange.value)
				.insertContentAt(mentionRange.value.from, [
					{
						type: 'mention',
						attrs: {
							id: user.id,
							label: user.label,
						},
					},
				])
				.run();

			showSuggestions.value = false;
		}
	};

	const CustomMention = Mention.configure({
		HTMLAttributes: {
			class: 'mention',
		},
		suggestion: {
			char: '@',
			items: async ({ query }) => {
				isLoading.value = true;
				try {
					const userOrgIds = currentUser.value?.organizations?.map((org) => org.organizations_id.id) || [];

					console.log(userOrgIds);

					const users = await readUsers({
						fields: ['id', 'first_name', 'last_name', 'email', 'avatar', 'organizations.organizations_id.id'],
						filter: {
							organizations: {
								organizations_id: {
									id: {
										_in: userOrgIds,
									},
								},
							},
							_and: [
								{
									id: {
										_neq: currentUser.value?.id, // Exclude current user
									},
								},
							],
						},
						search: query,
					});

					console.log(users);

					return users
						.filter((user) => {
							const userOrgs = user.organizations?.map((org) => org.organizations_id.id) || [];
							return userOrgs.some((orgId) => userOrgIds.includes(orgId));
						})
						.map((user) => ({
							id: user.id,
							label: `${user.first_name} ${user.last_name}`,
							email: user.email,
							avatar: user.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small` : null,
						}));
				} catch (error) {
					console.error('Error fetching users:', error);
					return [];
				} finally {
					isLoading.value = false;
				}
			},
			render: () => ({
				onStart: ({ clientRect, items, range }) => {
					showSuggestions.value = true;
					suggestions.value = items;
					selectedIndex.value = 0;
					mentionRange.value = range;

					if (clientRect) {
						const coords = clientRect();
						suggestionPosition.value = {
							x: coords.left,
							y: coords.bottom + window.scrollY,
						};
					}
				},

				onUpdate({ items, range }) {
					suggestions.value = items;
					selectedIndex.value = 0;
					mentionRange.value = range;
				},

				onKeyDown({ event }) {
					if (event.key === 'ArrowUp') {
						selectedIndex.value = (selectedIndex.value + suggestions.value.length - 1) % suggestions.value.length;
						return true;
					}

					if (event.key === 'ArrowDown') {
						selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length;
						return true;
					}

					if (event.key === 'Enter' && suggestions.value[selectedIndex.value]) {
						selectUser(suggestions.value[selectedIndex.value]);
						return true;
					}

					return false;
				},

				onExit() {
					showSuggestions.value = false;
					suggestions.value = [];
					selectedIndex.value = 0;
					mentionRange.value = null;
				},
			}),
		},
	});

	onMounted(() => {
		editor.value = new Editor({
			content: content.value,
			extensions: [StarterKit, CustomMention],
			onUpdate: ({ editor }) => {
				content.value = editor.getHTML();
			},
		});
	});

	return {
		editor,
		showSuggestions,
		suggestionPosition,
		suggestions,
		selectedIndex,
		isLoading,
		selectUser,
	};
}
