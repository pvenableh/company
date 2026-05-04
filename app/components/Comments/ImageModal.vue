<template>
	<UModal v-model="isOpen">
		<transition name="fade">
			<img v-if="currentImage" :src="currentImage" alt="Expanded view" class="w-full h-auto rounded-lg" />
		</transition>
	</UModal>
</template>

<script setup>
const isOpen = ref(false);
const currentImage = ref('');

const closeModal = () => {
	isOpen.value = false;
	currentImage.value = '';
};

const toggleModal = (imageSrc) => {
	if (!isOpen.value) {
		currentImage.value = imageSrc;
		isOpen.value = true;
	} else {
		closeModal();
	}
};

const handleImageClick = (event) => {
	const image = event.target;
	if (image.tagName === 'IMG' && image.closest('.comment')) {
		// event.preventDefault();
		toggleModal(image.src);
	}
};

onMounted(() => {
	document.addEventListener('click', handleImageClick);
});

onUnmounted(() => {
	document.removeEventListener('click', handleImageClick);
});
</script>
