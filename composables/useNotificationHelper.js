// composables/useNotificationHelper.js

/**
 * A composable to handle common notification scenarios in your app
 */
export function useNotificationHelper() {
	const { data, status } = useAuth();
	const user = computed(() => {
		return status.value === 'authenticated' ? data?.value?.user ?? null : null;
	});
	const { notify, notifyMany } = useNotifications();
	const config = useRuntimeConfig();

	// Get base URL for constructing item links
	const baseUrl = import.meta.client ? window.location.origin : config.public.appUrl || 'https://huestudios.company';

	/**
	 * Handle ticket status changes - notifies all assigned users
	 */
	const notifyTicketStatusChange = async (ticket, newStatus, oldStatus) => {
		if (!ticket || !ticket.id || !newStatus || newStatus === oldStatus) return;

		// Get all assigned users except current user
		const assignedUsers =
			ticket.assigned_to
				?.map((assignment) => assignment.directus_users_id?.id)
				.filter((id) => id && id !== user.value?.id) || [];

		// If no other users are assigned, exit
		if (assignedUsers.length === 0) return;

		const itemUrl = `${baseUrl}/tickets/${ticket.id}`;
		const statusChange = `${oldStatus} → ${newStatus}`;

		await notifyMany({
			recipients: assignedUsers,
			subject: `Ticket Status Changed: ${ticket.title}`,
			message: `<strong>${user.value?.first_name} ${user.value?.last_name}</strong> changed the status from <strong>${statusChange}</strong> on:<br><a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${ticket.title}</a>`,
			collection: 'tickets',
			item: ticket.id,
		});
	};

	/**
	 * Handle ticket assignment - notifies newly assigned users
	 */
	const notifyTicketAssignment = async (ticket, newAssignments, previousAssignments = []) => {
		if (!ticket || !ticket.id || !newAssignments) return;

		// Find users who were newly assigned (not in previous assignments)
		const newlyAssignedUsers = newAssignments.filter(
			(id) => !previousAssignments.includes(id) && id !== user.value?.id,
		);

		if (newlyAssignedUsers.length === 0) return;

		const itemUrl = `${baseUrl}/tickets/${ticket.id}`;

		await notifyMany({
			recipients: newlyAssignedUsers,
			subject: `You've been assigned to a ticket`,
			message: `<strong>${user.value?.first_name} ${user.value?.last_name}</strong> assigned you to:<br><a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${ticket.title}</a>`,
			collection: 'tickets',
			item: ticket.id,
		});
	};

	/**
	 * Handle ticket updates - notifies all assigned users about changes
	 */
	const notifyTicketUpdate = async (ticket, updatedFields = []) => {
		if (!ticket || !ticket.id || updatedFields.length === 0) return;

		// Get all assigned users except current user
		const assignedUsers =
			ticket.assigned_to
				?.map((assignment) => assignment.directus_users_id?.id)
				.filter((id) => id && id !== user.value?.id) || [];

		// Include ticket creator if not already in the list
		if (
			ticket.user_created?.id &&
			ticket.user_created.id !== user.value?.id &&
			!assignedUsers.includes(ticket.user_created.id)
		) {
			assignedUsers.push(ticket.user_created.id);
		}

		// If no recipients, exit
		if (assignedUsers.length === 0) return;

		const itemUrl = `${baseUrl}/tickets/${ticket.id}`;
		const fieldsText =
			updatedFields.length > 1 ? `updated ${updatedFields.join(', ')} on` : `updated ${updatedFields[0]} on`;

		await notifyMany({
			recipients: assignedUsers,
			subject: `Ticket Updated: ${ticket.title}`,
			message: `<strong>${user.value?.first_name} ${user.value?.last_name}</strong> ${fieldsText}:<br><a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${ticket.title}</a>`,
			collection: 'tickets',
			item: ticket.id,
		});
	};

	/**
	 * Handle new comments - notifies all users involved in the ticket
	 */
	const notifyNewComment = async (comment, ticketId, ticketTitle, ticketAssignees = []) => {
		if (!comment || !ticketId || !ticketTitle) return;

		// Prepare list of users to notify (assigned users + ticket creator)
		const recipients = [...ticketAssignees].filter((id) => id !== user.value?.id);

		if (recipients.length === 0) return;

		const itemUrl = `${baseUrl}/tickets/${ticketId}`;

		// Get a preview of the comment text (strip HTML tags, limit length)
		const commentText = comment.replace(/<[^>]*>?/gm, '');
		const commentPreview = commentText.length > 100 ? `${commentText.substring(0, 100)}...` : commentText;

		await notifyMany({
			recipients,
			subject: `New comment on ticket: ${ticketTitle}`,
			message: `<strong>${user.value?.first_name} ${user.value?.last_name}</strong> commented on:<br><a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${ticketTitle}</a><br><br><em>"${commentPreview}"</em>`,
			collection: 'tickets',
			item: ticketId,
		});
	};

	/**
	 * Handle @mentions in comments or descriptions - notifies mentioned users
	 */
	const notifyMentions = async (mentionedUserIds, itemId, itemTitle, collection) => {
		if (!mentionedUserIds || !itemId || !itemTitle || !collection) return;

		// Filter out current user if they somehow mentioned themselves
		const recipients = mentionedUserIds.filter((id) => id !== user.value?.id);
		if (recipients.length === 0) return;

		const itemUrl = `${baseUrl}/${collection}/${itemId}`;

		await notifyMany({
			recipients,
			subject: `You were mentioned in ${collection}: ${itemTitle}`,
			message: `<strong>${user.value?.first_name} ${user.value?.last_name}</strong> mentioned you in:<br><a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${itemTitle}</a>`,
			collection,
			item: itemId,
		});
	};

	const getCommentNavigationLink = async (commentId) => {
		if (!commentId) return null;

		try {
			// Fetch the comment with its collection and item data
			const { readItems } = useDirectusItems();
			const comment = await readItems('comments', {
				filter: { id: { _eq: commentId } },
				fields: ['id', 'collection', 'item'],
				limit: 1,
			});

			if (!comment || comment.length === 0) return null;

			const { collection, item } = comment[0];

			// Return the URL to the parent item
			if (collection && item) {
				return `/${collection}/${item}`;
			}

			return null;
		} catch (error) {
			console.error('Error generating comment navigation link:', error);
			return null;
		}
	};

	const getTaskNotificationLink = async (taskId) => {
		if (!taskId) return null;

		try {
			// Use readItems to fetch the task with its ticket_id
			const { readItems } = useDirectusItems();
			const task = await readItems('tasks', {
				filter: { id: { _eq: taskId } },
				fields: ['id', 'ticket_id'],
				limit: 1,
			});

			// Check if we got a valid result with a ticket_id
			if (task && task.length > 0 && task[0].ticket_id) {
				const ticketId = task[0].ticket_id;
				// Construct and return the ticket URL
				return `/tickets/${ticketId}`;
			}

			return null;
		} catch (error) {
			console.error('Error getting task notification link:', error);
			return null;
		}
	};

	/**
	 * Handle task creation and assignment - notifies assigned users
	 */
	const notifyTaskAssignment = async (task, ticketId, ticketTitle) => {
		if (!task || !task.assignedTo || !ticketId || !ticketTitle) return;

		// Filter assigned users
		const recipients = Array.isArray(task.assignedTo)
			? task.assignedTo.filter((id) => id !== user.value?.id)
			: task.assignedTo !== user.value?.id
				? [task.assignedTo]
				: [];

		if (recipients.length === 0) return;

		const itemUrl = `${baseUrl}/tickets/${ticketId}`;

		await notifyMany({
			recipients,
			subject: `You've been assigned a task`,
			message: `<strong>${user.value?.first_name} ${user.value?.last_name}</strong> assigned you a task on:<br><a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${ticketTitle}</a><br><br><strong>Task:</strong> ${task.title || 'Unnamed task'}`,
			collection: 'tickets',
			item: ticketId,
		});
	};

	/**
	 * Handle task completion - notifies ticket owner and users involved
	 */
	const notifyTaskCompletion = async (task, ticketId, ticketTitle, ticketAssignees = [], ticketCreator = null) => {
		if (!task || !task.title || !ticketId || !ticketTitle) return;

		// Prepare recipients list - remove current user
		const recipients = [...ticketAssignees];

		// Add ticket creator if provided and not already in the list
		if (ticketCreator && !recipients.includes(ticketCreator)) {
			recipients.push(ticketCreator);
		}

		// Filter out current user
		const filteredRecipients = recipients.filter((id) => id !== user.value?.id);

		if (filteredRecipients.length === 0) return;

		const itemUrl = `${baseUrl}/tickets/${ticketId}`;

		await notifyMany({
			recipients: filteredRecipients,
			subject: `Task completed on: ${ticketTitle}`,
			message: `<strong>${user.value?.first_name} ${user.value?.last_name}</strong> completed the task "<strong>${task.title}</strong>" on:<br><a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${ticketTitle}</a>`,
			collection: 'tickets',
			item: ticketId,
		});
	};

	/**
	 * Handle due date approaching - reminds assigned users
	 */
	const notifyDueDateApproaching = async (ticket) => {
		if (!ticket || !ticket.id || !ticket.due_date || !ticket.title) return;

		// Get assigned users
		const assignedUsers =
			ticket.assigned_to?.map((assignment) => assignment.directus_users_id?.id).filter((id) => id) || [];

		if (assignedUsers.length === 0) return;

		const itemUrl = `${baseUrl}/tickets/${ticket.id}`;
		const dueDate = new Date(ticket.due_date);
		const formattedDate = dueDate.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});

		await notifyMany({
			recipients: assignedUsers,
			subject: `Reminder: Ticket Due Soon`,
			message: `The ticket "<a href="${itemUrl}" class="text-[var(--cyan)] font-bold">${ticket.title}</a>" is due on <strong>${formattedDate}</strong>.`,
			collection: 'tickets',
			item: ticket.id,
		});
	};

	return {
		getTaskNotificationLink,
		getCommentNavigationLink,
		notifyTicketStatusChange,
		notifyTicketAssignment,
		notifyTicketUpdate,
		notifyNewComment,
		notifyMentions,
		notifyTaskAssignment,
		notifyTaskCompletion,
		notifyDueDateApproaching,
	};
}
