// composables/useMobileNavigation.js

import { ref } from 'vue';

export function useMobileBoardNavigation(options = {}) {
	// Default column configuration
	const defaultColumns = options.columns || [];

	// Reactive state
	const isMobile = ref(false);
	const activeColumn = ref(defaultColumns.length > 0 ? defaultColumns[0].id : null);
	const touchStart = ref({ x: 0, y: 0 });

	// Check if the device is mobile based on screen width
	const checkMobile = () => {
		isMobile.value = window.innerWidth < (options.breakpoint || 768);
	};

	// Navigate to the next column
	const nextColumn = () => {
		if (!defaultColumns.length) return;

		const currentIndex = defaultColumns.findIndex((col) => col.id === activeColumn.value);
		activeColumn.value = defaultColumns[(currentIndex + 1) % defaultColumns.length].id;

		// Execute callback if provided
		if (options.onColumnChange) {
			options.onColumnChange(activeColumn.value);
		}
	};

	// Navigate to the previous column
	const previousColumn = () => {
		if (!defaultColumns.length) return;

		const currentIndex = defaultColumns.findIndex((col) => col.id === activeColumn.value);
		activeColumn.value = defaultColumns[(currentIndex - 1 + defaultColumns.length) % defaultColumns.length].id;

		// Execute callback if provided
		if (options.onColumnChange) {
			options.onColumnChange(activeColumn.value);
		}
	};

	// Handle touch start event for swipe detection
	const handleTouchStart = (event) => {
		touchStart.value = {
			x: event.touches[0].clientX,
			y: event.touches[0].clientY,
		};
	};

	// Handle touch end event for swipe detection
	const handleTouchEnd = (event) => {
		const touchEnd = {
			x: event.changedTouches[0].clientX,
			y: event.changedTouches[0].clientY,
		};

		const deltaX = touchEnd.x - touchStart.value.x;
		const deltaY = touchEnd.y - touchStart.value.y;

		// If horizontal swipe is greater than vertical swipe and exceeds threshold
		const swipeThreshold = options.swipeThreshold || 50;
		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
			if (deltaX > 0) {
				// Swipe right
				previousColumn();
			} else {
				// Swipe left
				nextColumn();
			}
		}
	};

	// Set active column directly (useful for programmatic navigation)
	const setActiveColumn = (columnId) => {
		if (defaultColumns.some((col) => col.id === columnId)) {
			activeColumn.value = columnId;

			// Execute callback if provided
			if (options.onColumnChange) {
				options.onColumnChange(activeColumn.value);
			}
		}
	};

	// Setup function to be called in component's onMounted
	const setupMobileDetection = () => {
		// Initial check
		checkMobile();

		// Only add event listener in client-side environment
		if (import.meta.client) {
			window.addEventListener('resize', checkMobile);
		}

		// Return cleanup function
		return () => {
			if (import.meta.client) {
				window.removeEventListener('resize', checkMobile);
			}
		};
	};

	return {
		// State
		isMobile,
		activeColumn,

		// Methods
		checkMobile,
		nextColumn,
		previousColumn,
		handleTouchStart,
		handleTouchEnd,
		setActiveColumn,

		// Setup & cleanup
		setupMobileDetection,
	};
}
