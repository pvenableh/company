export default defineNuxtPlugin((nuxtApp) => {
	// Comment mention notification
	nuxtApp.vueApp.directive('comment-mention', {
		mounted(el, binding) {
			const { createNotification } = useNotifications();

			const observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					const mentions = mutation.target.querySelectorAll('.mention');
					mentions.forEach(async (mention) => {
						const userId = mention.getAttribute('data-id');
						if (userId) {
							await createNotification({
								recipient: userId,
								subject: 'You were mentioned in a comment',
								message: `${binding.value.user.first_name} mentioned you in a comment: "${mutation.target.textContent}"`,
								collection: binding.value.collection,
								item: binding.value.itemId,
							});
						}
					});
				});
			});

			observer.observe(el, {
				childList: true,
				subtree: true,
				characterData: true,
			});
		},
	});

	// Comment reply notification
	nuxtApp.provide('notifyCommentReply', async (comment) => {
		const { createNotification } = useNotifications();
		if (comment.parent_id) {
			const parentComment = await useDirectusItems().readItem('comments', comment.parent_id);
			await createNotification({
				recipient: parentComment.user,
				subject: 'New reply to your comment',
				message: `${comment.user.first_name} replied to your comment`,
				collection: comment.collection,
				item: comment.item,
			});
		}
	});

	// Task assignment notification
	nuxtApp.provide('notifyTaskAssignment', async (taskId, assignedUserId) => {
		const { createNotification } = useNotifications();
		const task = await useDirectusItems().readItem('tasks', taskId);
		await createNotification({
			recipient: assignedUserId,
			subject: 'New task assignment',
			message: `You have been assigned to the task: ${task.title}`,
			collection: 'tasks',
			item: taskId,
		});
	});
});
