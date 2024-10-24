import { ref } from 'vue';

export const useAuthRefresh = () => {
	const lastRefreshAttempt = ref(0);
	const refreshCooldown = ref(1000); // 1 second default

	const canAttemptRefresh = () => {
		const now = Date.now();
		if (now - lastRefreshAttempt.value < refreshCooldown.value) {
			return false;
		}
		lastRefreshAttempt.value = now;
		return true;
	};

	const setCooldown = (ms: number) => {
		refreshCooldown.value = ms;
	};

	return {
		canAttemptRefresh,
		setCooldown,
		lastRefreshAttempt,
	};
};
