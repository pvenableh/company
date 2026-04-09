// composables/useStorageSync.js

/**
 * A unified storage solution that synchronizes state between cookies, localStorage,
 * and reactive state across tabs
 *
 * @param {string} key - The key to use for storage (same key used for cookie, localStorage, and useState)
 * @param {Object} options - Configuration options
 * @returns {Object} Storage management methods
 */
export function useStorageSync(key, options = {}) {
	if (!key) {
		throw new Error('A key must be provided to useStorageSync');
	}

	// Initialize options with defaults
	const config = {
		debug: false,
		initialValue: null,
		cookie: {
			maxAge: 60 * 60 * 24 * 30, // 30 days default
			path: '/',
			sameSite: 'lax',
		},
		priorities: ['cookie', 'localStorage'], // Default priority order
		...options,
	};

	// Set up debug logger
	const log = (...args) => {
		if (config.debug) {
			console.log(`[StorageSync:${key}]`, ...args);
		}
	};

	// Create reactive state and cookie
	const state = useState(key, () => config.initialValue);
	const cookie = useCookie(key, config.cookie);

	// Set value to all storage mechanisms
	const setValue = (value) => {
		log('Setting value:', value);

		// Track successes for error reporting
		const results = {
			state: false,
			cookie: false,
			localStorage: false,
		};

		// Set state value (should always work)
		try {
			state.value = value;
			results.state = true;
		} catch (e) {
			console.error(`Failed to set ${key} in state:`, e);
		}

		// Set cookie value
		try {
			cookie.value = value;
			results.cookie = true;
		} catch (e) {
			console.error(`Failed to set ${key} in cookie:`, e);
		}

		// Set localStorage value (client-side only)
		if (import.meta.client) {
			try {
				if (value === null || value === undefined) {
					localStorage.removeItem(key);
				} else {
					localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value);
				}
				results.localStorage = true;
			} catch (e) {
				console.error(`Failed to set ${key} in localStorage:`, e);
			}
		}

		// Log success/failure status
		log('Set operation results:', results);

		// Alert if all persistence mechanisms failed
		if (!results.cookie && !results.localStorage) {
			console.warn(`Failed to persist ${key} to any permanent storage`);
		}

		return value;
	};

	// Get value from storage based on priority order
	const getValue = (customPriorities = null) => {
		const priorities = customPriorities || config.priorities;
		let value = null;

		log('Getting value with priorities:', priorities);

		for (const priority of priorities) {
			if (priority === 'state' && state.value !== null && state.value !== undefined) {
				value = state.value;
				log('Found value in state:', value);
				break;
			}

			if (priority === 'cookie' && cookie.value !== null && cookie.value !== undefined) {
				value = cookie.value;
				log('Found value in cookie:', value);
				break;
			}

			if (priority === 'localStorage' && import.meta.client) {
				try {
					const storedValue = localStorage.getItem(key);
					if (storedValue !== null) {
						try {
							// Try to parse as JSON if it looks like JSON
							if (storedValue.startsWith('{') || storedValue.startsWith('[')) {
								value = JSON.parse(storedValue);
							} else {
								value = storedValue;
							}
							log('Found value in localStorage:', value);
							break;
						} catch (e) {
							// If parsing fails, use raw value
							value = storedValue;
							log('Found non-JSON value in localStorage:', value);
							break;
						}
					}
				} catch (e) {
					console.warn(`Failed to read ${key} from localStorage:`, e);
				}
			}
		}

		return value;
	};

	// Clear value from all storage mechanisms
	const clearValue = () => {
		log('Clearing value');
		return setValue(null);
	};

	// Restore value from storage on initialization
	const restoreValue = (force = false) => {
		if (state.value === null || state.value === undefined || force) {
			const value = getValue();
			if (value !== null && value !== undefined) {
				log('Restoring value:', value);
				state.value = value;
				return true;
			}
		}
		return false;
	};

	// Validate that a value exists in the allowlist
	const validateValue = (value, allowlist) => {
		if (!allowlist || !Array.isArray(allowlist) || allowlist.length === 0) {
			return true;
		}

		return allowlist.some((item) => {
			if (typeof item === 'object' && item !== null && 'id' in item) {
				return item.id === value;
			}
			return item === value;
		});
	};

	// Sets up storage event listener for cross-tab synchronization
	const setupSyncListener = () => {
		if (!import.meta.client) {
			log('Not setting up sync listener (not in client)');
			return () => {}; // Return no-op cleanup function for SSR
		}

		log('Setting up cross-tab sync listener');

		const listener = (event) => {
			if (event.key === key) {
				log('Storage change detected in another tab', {
					oldValue: event.oldValue,
					newValue: event.newValue,
				});

				if (event.newValue === null) {
					// Clear was triggered in another tab
					state.value = null;
				} else {
					try {
						// Try to parse JSON if it looks like JSON
						let newValue = event.newValue;
						if (typeof newValue === 'string' && (newValue.startsWith('{') || newValue.startsWith('['))) {
							newValue = JSON.parse(newValue);
						}
						state.value = newValue;
					} catch (e) {
						state.value = event.newValue;
					}
				}
			}
		};

		window.addEventListener('storage', listener);

		// Return cleanup function
		return () => {
			log('Removing cross-tab sync listener');
			window.removeEventListener('storage', listener);
		};
	};

	// Auto-restore value on initialization
	restoreValue();

	// Return the API
	return {
		// Read-only access to the reactive state
		state: readonly(state),

		// Core operations
		getValue,
		setValue,
		clearValue,
		restoreValue,

		// Utility functions
		validateValue,
		setupSyncListener,

		// Debug control
		enableDebug: () => {
			config.debug = true;
			log('Debug enabled');
		},
		disableDebug: () => {
			config.debug = false;
		},
	};
}
