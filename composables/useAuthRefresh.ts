import { ref } from 'vue';

export const useAuthRefresh = (defaultCooldown: number = 5000) => {
	const lastRefreshAttempt = ref(0);
	const refreshCooldown = ref(defaultCooldown);

	/**
	 * Determines if a refresh attempt is allowed based on the cooldown period.
	 * @returns {boolean} True if allowed, false otherwise.
	 */
	const isRefreshAllowed = (): boolean => {
		const now = Date.now();
		if (now - lastRefreshAttempt.value < refreshCooldown.value) {
			console.info(
				`Refresh blocked. Cooldown active. ${refreshCooldown.value - (now - lastRefreshAttempt.value)} ms remaining.`,
			);
			return false;
		}
		lastRefreshAttempt.value = now;
		return true;
	};

	/**
	 * Updates the cooldown period.
	 * @param ms {number} The new cooldown period in milliseconds.
	 */
	const setCooldown = (ms: number): void => {
		refreshCooldown.value = ms;
		console.info(`Cooldown period updated to ${ms} ms.`);
	};

	return {
		isRefreshAllowed,
		setCooldown,
		lastRefreshAttempt,
		refreshCooldown,
	};
};
