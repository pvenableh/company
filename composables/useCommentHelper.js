// composables/useCommentHelper.js

/**
 * A composable to handle comment creation with dynamic field generation based on collection name
 */
export function useCommentHelper() {
	const commentItems = useDirectusItems('comments');
	const { user: sessionUser, loggedIn } = useUserSession();
	const user = computed(() => {
		return loggedIn.value ? sessionUser.value ?? null : null;
	});
	const { notify } = useNotifications();

	/**
	 * Generate dynamic field names based on collection
	 * @param {string} collection - The collection name (e.g., 'tickets', 'projects')
	 * @returns {string} - The field name (e.g., 'tickets_id', 'projects_id')
	 */
	const getDynamicFieldName = (collection) => {
		// Handle plurals that don't end with 's'
		if (collection.endsWith('ies')) {
			// e.g., 'entries' -> 'entry_id'
			const singular = collection.slice(0, -3) + 'y';
			return `${singular}_id`;
		} else if (collection.endsWith('s')) {
			// e.g., 'tickets' -> 'tickets_id'
			return `${collection}_id`;
		} else {
			// For collections that are already singular
			return `${collection}_id`;
		}
	};

	/**
	 * Create a comment with direct linking to parent item
	 */
	const createComment = async (content, options) => {
		const {
			collection, // The collection the comment belongs to (e.g., 'tickets')
			itemId, // The ID of the item in the collection
			parentId, // Optional parent comment ID for replies
			organizationId, // Optional organization ID
		} = options;

		if (!content || !collection || !itemId) {
			throw new Error('Missing required parameters: content, collection, or itemId');
		}

		// Generate the dynamic field name based on collection
		const dynamicField = getDynamicFieldName(collection);

		// Prepare comment data
		const commentData = {
			status: 'published',
			comment: content,
			user: user.value?.id,
			date_created: new Date().toISOString(),

			// Store parent relationships
			parent_id: parentId || null,

			// Store collection data directly
			collection: collection,
			item: itemId.toString(),

			// Add dynamic field
			[dynamicField]: itemId.toString(),
		};

		// Add organization reference if provided
		if (organizationId) {
			commentData.organization = organizationId.toString();
		}

		try {
			const newComment = await commentItems.create(commentData);
			return newComment;
		} catch (error) {
			console.error('Error creating comment:', error);
			throw error;
		}
	};

	/**
	 * Delete a comment
	 */
	const removeComment = async (commentId) => {
		if (!commentId) return null;

		try {
			await commentItems.remove(commentId);
			return true;
		} catch (error) {
			console.error('Error deleting comment:', error);
			throw error;
		}
	};

	/**
	 * Notify users mentioned in a comment
	 */
	const notifyMentionedUsers = async (mentionedUserIds, commentText, collection, itemId) => {
		if (!mentionedUserIds || !Array.isArray(mentionedUserIds) || mentionedUserIds.length === 0) return;

		try {
			const itemUrl = `https://huestudios.company/${collection}/${itemId}`;

			const notificationPromises = mentionedUserIds.map((userId) =>
				notify({
					recipient: userId,
					subject: `You were mentioned in a comment`,
					message: `<strong>${user.value?.first_name} ${user.value?.last_name}</strong> mentioned you in a comment:<br>
                    <a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${commentText.substring(0, 100)}${commentText.length > 100 ? '...' : ''}</a>`,
					collection: collection,
					item: itemId,
					sender: user.value?.id,
				}),
			);

			await Promise.all(notificationPromises);
		} catch (error) {
			console.error('Error sending mention notifications:', error);
		}
	};

	return {
		createComment,
		removeComment,
		notifyMentionedUsers,
		getDynamicFieldName,
	};
}

export default useCommentHelper;
