// composables/useUserPresence.js
export function useUserPresence() {
	const { user } = useDirectusAuth();
	const route = useRoute();
	const { createItem, deleteItems, readItems, updateItem } = useDirectusItems();
	const location = ref(route.fullPath);
	const presenceId = ref(null);
	const heartbeatInterval = ref(null);
	const HEARTBEAT_INTERVAL = 30000; // 30 seconds
	const STALE_THRESHOLD = 60000; // 1 minute

	// Subscribe to user presence updates with enhanced filtering
	const { data: allUserPresence } = useRealtimeSubscription(
		'user_presence',
		['id', 'user_id.id', 'user_id.first_name', 'user_id.last_name', 'user_id.avatar', 'location', 'last_seen'],
		{
			_and: [
				{ location: { _eq: location.value } },
				{
					last_seen: {
						_gt: new Date(Date.now() - STALE_THRESHOLD).toISOString(),
					},
				},
			],
		},
	);

	// Filter out current user and stale presence records
	const otherUsersPresence = computed(() => {
		if (!user.value || !allUserPresence.value) return [];

		const now = Date.now();
		return allUserPresence.value.filter((p) => {
			const isStale = now - new Date(p.last_seen).getTime() > STALE_THRESHOLD;
			return p.user_id.id !== user.value.id && !isStale;
		});
	});

	// Update presence with retry logic
	const updatePresence = async (retryCount = 3) => {
		if (!user.value) return;

		try {
			if (presenceId.value) {
				// Update existing presence record
				await updateItem('user_presence', presenceId.value, {
					last_seen: new Date().toISOString(),
				});
			} else {
				// Check for existing records first
				const existingRecords = await readItems('user_presence', {
					filter: {
						user_id: { _eq: user.value.id },
						location: { _eq: location.value },
					},
				});

				if (existingRecords?.length > 0) {
					// Update existing record
					presenceId.value = existingRecords[0].id;
					await updateItem('user_presence', presenceId.value, {
						last_seen: new Date().toISOString(),
					});
				} else {
					// Create new record
					const newPresence = await createItem('user_presence', {
						user_id: user.value.id,
						location: location.value,
						last_seen: new Date().toISOString(),
					});
					presenceId.value = newPresence.id;
				}
			}
		} catch (err) {
			console.error('Error updating presence:', err);
			if (retryCount > 0) {
				// Exponential backoff retry
				setTimeout(
					() => {
						updatePresence(retryCount - 1);
					},
					Math.pow(2, 3 - retryCount) * 1000,
				);
			}
		}
	};

	// Clean up presence records
	const removePresence = async () => {
		if (!user.value) return;

		try {
			if (presenceId.value) {
				await deleteItems('user_presence', {
					filter: { id: { _eq: presenceId.value } },
				});
				presenceId.value = null;
			} else {
				// Cleanup any orphaned records
				await deleteItems('user_presence', {
					filter: {
						user_id: { _eq: user.value.id },
						location: { _eq: location.value },
					},
				});
			}
		} catch (err) {
			console.error('Error removing presence:', err);
		}
	};

	// Start heartbeat
	const startHeartbeat = () => {
		if (heartbeatInterval.value) return;
		heartbeatInterval.value = setInterval(updatePresence, HEARTBEAT_INTERVAL);
	};

	// Stop heartbeat
	const stopHeartbeat = () => {
		if (heartbeatInterval.value) {
			clearInterval(heartbeatInterval.value);
			heartbeatInterval.value = null;
		}
	};

	// Handle visibility changes
	const handleVisibilityChange = () => {
		if (document.hidden) {
			stopHeartbeat();
			removePresence();
		} else {
			updatePresence();
			startHeartbeat();
		}
	};

	// Watch for route changes
	watch(
		() => route.fullPath,
		async (newPath) => {
			await removePresence();
			location.value = newPath;
			await updatePresence();
		},
	);

	// Lifecycle hooks
	onMounted(async () => {
		await updatePresence();
		startHeartbeat();
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onBeforeUnmount(() => {
		stopHeartbeat();
		removePresence();
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	return {
		userPresence: otherUsersPresence,
		isOnline: computed(() => presenceId.value !== null),
	};
}
