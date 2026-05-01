export const tokenModalOpen = ref(false);

export function openTokenModal() {
	tokenModalOpen.value = true;
}

export function closeTokenModal() {
	tokenModalOpen.value = false;
}
