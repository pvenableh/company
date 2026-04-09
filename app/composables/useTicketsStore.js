import { ref } from 'vue';

const refreshCallback = ref(null);

export const useTicketsStore = () => {
	const registerRefreshCallback = (callback) => {
		refreshCallback.value = callback;
	};

	const triggerRefresh = () => {
		if (refreshCallback.value) {
			refreshCallback.value();
		}
	};

	return {
		registerRefreshCallback,
		triggerRefresh,
	};
};
