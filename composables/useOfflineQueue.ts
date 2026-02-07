// composables/useOfflineQueue.ts
/**
 * useOfflineQueue - Offline mutation queue for PWA support
 *
 * Persists mutations (create, update, delete) to IndexedDB when offline,
 * and replays them in order when connectivity is restored.
 *
 * Usage:
 * const { enqueue, pending, isOnline, flush } = useOfflineQueue()
 *
 * // In a mutation handler:
 * try {
 *   await ticketItems.update(id, data)
 * } catch (error) {
 *   if (!isOnline.value) {
 *     enqueue({ collection: 'tickets', operation: 'update', id, data })
 *   }
 * }
 */

interface QueuedMutation {
	id: string
	collection: string
	operation: 'create' | 'update' | 'delete'
	itemId?: string | number | (string | number)[]
	data?: Record<string, any>
	query?: Record<string, any>
	timestamp: number
	retries: number
}

const DB_NAME = 'directus-offline-queue'
const STORE_NAME = 'mutations'
const DB_VERSION = 1
const MAX_RETRIES = 3

// Module-level state
let _db: IDBDatabase | null = null

/**
 * Open or create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
	if (_db) return Promise.resolve(_db)

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' })
			}
		}

		request.onsuccess = () => {
			_db = request.result
			resolve(_db)
		}

		request.onerror = () => {
			reject(request.error)
		}
	})
}

/**
 * Generate a unique ID for queue entries
 */
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useOfflineQueue() {
	const isOnline = ref(import.meta.client ? navigator.onLine : true)
	const pending = ref<QueuedMutation[]>([])
	const isFlushing = ref(false)
	const toast = useToast()

	/**
	 * Load all pending mutations from IndexedDB
	 */
	const loadPending = async (): Promise<void> => {
		if (!import.meta.client) return

		try {
			const db = await openDB()
			const tx = db.transaction(STORE_NAME, 'readonly')
			const store = tx.objectStore(STORE_NAME)
			const request = store.getAll()

			return new Promise((resolve) => {
				request.onsuccess = () => {
					pending.value = (request.result as QueuedMutation[]).sort(
						(a, b) => a.timestamp - b.timestamp
					)
					resolve()
				}
				request.onerror = () => {
					console.error('[OfflineQueue] Failed to load pending mutations')
					resolve()
				}
			})
		} catch {
			// IndexedDB not available
		}
	}

	/**
	 * Add a mutation to the offline queue
	 */
	const enqueue = async (mutation: {
		collection: string
		operation: 'create' | 'update' | 'delete'
		itemId?: string | number | (string | number)[]
		data?: Record<string, any>
		query?: Record<string, any>
	}): Promise<void> => {
		if (!import.meta.client) return

		const entry: QueuedMutation = {
			id: generateId(),
			...mutation,
			timestamp: Date.now(),
			retries: 0,
		}

		try {
			const db = await openDB()
			const tx = db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			store.add(entry)

			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(tx.error)
			})

			pending.value = [...pending.value, entry]

			toast.info(`Saved offline. Will sync when connected.`, {
				description: `${mutation.operation} on ${mutation.collection}`,
			})
		} catch (error) {
			console.error('[OfflineQueue] Failed to enqueue mutation:', error)
		}
	}

	/**
	 * Remove a mutation from the queue after successful replay
	 */
	const dequeue = async (entryId: string): Promise<void> => {
		try {
			const db = await openDB()
			const tx = db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			store.delete(entryId)

			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(tx.error)
			})

			pending.value = pending.value.filter((m) => m.id !== entryId)
		} catch (error) {
			console.error('[OfflineQueue] Failed to dequeue:', error)
		}
	}

	/**
	 * Update retry count for a failed mutation
	 */
	const incrementRetry = async (entry: QueuedMutation): Promise<void> => {
		const updated = { ...entry, retries: entry.retries + 1 }

		try {
			const db = await openDB()
			const tx = db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			store.put(updated)

			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(tx.error)
			})

			pending.value = pending.value.map((m) =>
				m.id === entry.id ? updated : m
			)
		} catch (error) {
			console.error('[OfflineQueue] Failed to update retry count:', error)
		}
	}

	/**
	 * Replay a single mutation via the Directus items API
	 */
	const replayMutation = async (entry: QueuedMutation): Promise<boolean> => {
		try {
			const body: Record<string, any> = {
				collection: entry.collection,
				operation: entry.operation,
			}

			if (entry.itemId) body.id = entry.itemId
			if (entry.data) body.data = entry.data
			if (entry.query) body.query = entry.query

			await $fetch('/api/directus/items', {
				method: 'POST',
				body,
			})

			return true
		} catch (error) {
			console.error('[OfflineQueue] Replay failed:', entry.collection, entry.operation, error)
			return false
		}
	}

	/**
	 * Flush all pending mutations in order
	 */
	const flush = async (): Promise<{ succeeded: number; failed: number }> => {
		if (isFlushing.value || !isOnline.value) {
			return { succeeded: 0, failed: 0 }
		}

		isFlushing.value = true
		let succeeded = 0
		let failed = 0

		try {
			await loadPending()

			for (const entry of [...pending.value]) {
				if (entry.retries >= MAX_RETRIES) {
					// Too many failures, remove from queue
					await dequeue(entry.id)
					failed++
					continue
				}

				const success = await replayMutation(entry)

				if (success) {
					await dequeue(entry.id)
					succeeded++
				} else {
					await incrementRetry(entry)
					failed++
					// Stop on first failure to preserve order
					break
				}
			}

			if (succeeded > 0) {
				toast.success(`Synced ${succeeded} offline change${succeeded > 1 ? 's' : ''}.`)
			}

			if (failed > 0) {
				toast.warning(`${failed} change${failed > 1 ? 's' : ''} failed to sync.`)
			}
		} finally {
			isFlushing.value = false
		}

		return { succeeded, failed }
	}

	// ─── Lifecycle: listen for online/offline events ─────────────────────────

	if (import.meta.client) {
		const handleOnline = () => {
			isOnline.value = true
			flush()
		}

		const handleOffline = () => {
			isOnline.value = false
		}

		onMounted(async () => {
			window.addEventListener('online', handleOnline)
			window.addEventListener('offline', handleOffline)
			await loadPending()

			// Flush any queued mutations if we're online
			if (isOnline.value && pending.value.length > 0) {
				flush()
			}
		})

		onBeforeUnmount(() => {
			window.removeEventListener('online', handleOnline)
			window.removeEventListener('offline', handleOffline)
		})
	}

	return {
		/** Whether the browser is currently online */
		isOnline: readonly(isOnline),
		/** List of pending mutations waiting to be synced */
		pending: readonly(pending),
		/** Whether the queue is currently being flushed */
		isFlushing: readonly(isFlushing),
		/** Add a mutation to the offline queue */
		enqueue,
		/** Manually flush all pending mutations */
		flush,
	}
}
