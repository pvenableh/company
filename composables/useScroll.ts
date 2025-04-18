import { useThrottleFn } from '@vueuse/core';

export default function useScroll() {
	const progress = ref(0);

	const updateProgress = useThrottleFn(() => {
		const bodyHeight = document.body.clientHeight - document.documentElement.clientHeight;
		const scrollPosition = window.scrollY;

		progress.value = scrollPosition / bodyHeight;
	}, 100);

	function scrollToTop() {
		window.scrollTo({
			top: 0,
			behavior: 'smooth',
		});
	}

	onMounted(() => {
		if (import.meta.client) {
			window.addEventListener('scroll', updateProgress);
		}
	});

	onUnmounted(() => {
		if (import.meta.client) {
			window.removeEventListener('scroll', updateProgress);
		}
	});

	return { progress: readonly(progress), scrollToTop };
}
