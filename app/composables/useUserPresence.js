// composables/useUserPresence.js
/**
 * Per-page user presence — shows which users are viewing the same page.
 *
 * Creates a Directus `user_presence` record for the current user's location
 * and subscribes to real-time updates for the same location. When the user
 * navigates, the old record is removed and a new one is created, and the
 * subscription filter is updated so only co-viewers of the new page appear.
 *
 * Improvements over previous version:
 * - Subscription filter updates on route change (was a static snapshot)
 * - Debounced route-change handler to avoid thrashing on rapid navigation
 * - Visibility change pauses/resumes heartbeat (saves API calls when tab hidden)
 * - Proper cleanup of all listeners in onBeforeUnmount
 */
export function useUserPresence() {
	const { user: sessionUser, loggedIn } = useUserSession();
	const user = computed(() => (loggedIn.value ? sessionUser.value ?? null : null));
	const route = useRoute();
	const presenceItems = useDirectusItems('user_presence');
	const location = ref(route.fullPath);
	const presenceId = ref(null);
	const heartbeatInterval = ref(null);
	const HEARTBEAT_INTERVAL = 60000; // 60 seconds
	const STALE_THRESHOLD = 150000; // 2.5 minutes

	// Debounce timer for route changes
	let _routeChangeTimer = null;

	// Build the subscription filter for a given location
	const buildFilter = (loc) => ({
		_and: [
			{ location: { _eq: loc } },
			{
				last_seen: {
					_gt: new Date(Date.now() - STALE_THRESHOLD).toISOString(),
				},
			},
		],
	});

	// Subscribe to user presence updates
	const { data: allUserPresence, updateFilter } = useRealtimeSubscription(
		'user_presence',
		['id', 'user_id.id', 'user_id.first_name', 'user_id.last_name', 'user_id.avatar', 'location', 'last_seen'],
		buildFilter(location.value),
	);

	// Filter out current user and stale presence records
	const otherUsersPresence = computed(() => {
		if (!user.value || !allUserPresence.value) return [];

		const now = Date.now();
		return allUserPresence.value.filter((p) => {
			const isStale = now - new Date(p.last_seen).getTime() > STALE_THRESHOLD;
			return p.user_id?.id !== user.value.id && !isStale;
		});
	});

	// Update presence with retry logic
	const updatePresence = async (retryCount = 3) => {
		if (!user.value) return;

		try {
			if (presenceId.value) {
				// Update existing presence record
				await presenceItems.update(presenceId.value, {
					last_seen: new Date().toISOString(),
					location: location.value,
				});
			} else {
				// Check for existing records first
				const existingRecords = await presenceItems.list({
					filter: {
						user_id: { _eq: user.value.id },
						location: { _eq: location.value },
					},
				});

				if (existingRecords?.length > 0) {
					// Update existing record
					presenceId.value = existingRecords[0].id;
					await presenceItems.update(presenceId.value, {
						last_seen: new Date().toISOString(),
					});
				} else {
					// Create new record
					const newPresence = await presenceItems.create({
						user_id: user.value.id,
						location: location.value,
						last_seen: new Date().toISOString(),
					});
					presenceId.value = newPresence.id;
				}
			}
		} catch (err) {
			console.error('Error updating presence:', err);
			// If record was deleted server-side, clear local ID and retry
			if (err?.response?.status === 403 || err?.response?.status === 404) {
				presenceId.value = null;
			}
			if (retryCount > 0) {
				setTimeout(
					() => updatePresence(retryCount - 1),
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
				await presenceItems.remove(presenceId.value);
				presenceId.value = null;
			} else {
				// Cleanup any orphaned records for this location
				const orphaned = await presenceItems.list({
					filter: {
						user_id: { _eq: user.value.id },
						location: { _eq: location.value },
					},
					fields: ['id'],
				});
				if (orphaned.length) await presenceItems.remove(orphaned.map((r) => r.id));
			}
		} catch (err) {
			// Best effort — record may already be expired/removed
			presenceId.value = null;
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

	// Handle visibility changes — pause when hidden, resume when visible
	const handleVisibilityChange = () => {
		if (document.hidden) {
			stopHeartbeat();
		} else if (user.value) {
			updatePresence();
			startHeartbeat();
		}
	};

	// Watch for route changes with debounce to avoid thrashing on rapid navigation
	watch(
		() => route.fullPath,
		(newPath) => {
			if (newPath === location.value) return;

			if (_routeChangeTimer) clearTimeout(_routeChangeTimer);
			_routeChangeTimer = setTimeout(async () => {
				await removePresence();
				location.value = newPath;

				// Update the subscription filter so we see co-viewers on the new page
				updateFilter(buildFilter(newPath));

				await updatePresence();
			}, 150); // 150ms debounce — fast enough to feel instant, avoids thrashing
		},
	);

	// Lifecycle hooks
	onMounted(async () => {
		if (!user.value) return;
		await updatePresence();
		startHeartbeat();
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onBeforeUnmount(() => {
		if (_routeChangeTimer) clearTimeout(_routeChangeTimer);
		stopHeartbeat();
		removePresence();
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	return {
		userPresence: otherUsersPresence,
		isOnline: computed(() => presenceId.value !== null),
	};
}
