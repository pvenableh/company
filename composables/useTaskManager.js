export function useTaskManager(ticketId) {
	const { createItem, updateItem, deleteItem } = useDirectusItems();
	const isLoading = ref(false);
	const error = ref(null);

	const assignUserToTask = async (taskId, userId) => {
		isLoading.value = true;
		error.value = null;

		try {
			await createItem('tasks_directus_users', {
				tasks_id: taskId,
				directus_users_id: userId,
			});

			// Update the task's date_updated
			await updateItem('tasks', taskId, {
				date_updated: new Date(),
			});

			return true;
		} catch (err) {
			console.error('Error assigning user to task:', err);
			error.value = err;
			return false;
		} finally {
			isLoading.value = false;
		}
	};

	const removeUserFromTask = async (taskId, userId) => {
		isLoading.value = true;
		error.value = null;

		try {
			await deleteItems('tasks_directus_users', {
				filter: {
					tasks_id: { _eq: taskId },
					directus_users_id: { _eq: userId },
				},
			});

			// Update the task's date_updated
			await updateItem('tasks', taskId, {
				date_updated: new Date(),
			});

			return true;
		} catch (err) {
			console.error('Error removing user from task:', err);
			error.value = err;
			return false;
		} finally {
			isLoading.value = false;
		}
	};

	const createTask = async (taskData) => {
		isLoading.value = true;
		error.value = null;

		try {
			const task = await createItem('tasks', {
				...taskData,
				ticket: ticketId,
				date_created: new Date(),
				date_updated: new Date(),
			});

			// If there are assigned users, create the assignments
			if (taskData.assigned_to?.length) {
				await Promise.all(
					taskData.assigned_to.map((userId) =>
						createItem('tasks_directus_users', {
							tasks_id: task.id,
							directus_users_id: userId,
						}),
					),
				);
			}

			return task;
		} catch (err) {
			console.error('Error creating task:', err);
			error.value = err;
			return null;
		} finally {
			isLoading.value = false;
		}
	};

	return {
		isLoading,
		error,
		assignUserToTask,
		removeUserFromTask,
		createTask,
	};
}
