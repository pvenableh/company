import { ref } from 'vue';

const refreshCallback = ref<(() => void) | null>(null);

export const useLeadsStore = () => {
  const registerRefreshCallback = (callback: () => void) => {
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
