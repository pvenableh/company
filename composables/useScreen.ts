import { ref } from 'vue';

export const screen = ref(false)
export const loader = ref(false)
export const sheetOpen = ref(false)

export function toggleScreen() {
	screen.value = !screen.value
}
export function closeScreen() {
	screen.value = false
	loader.value = false
}
export function openScreen() {
	screen.value = true
}
export function toggleSheet() {
	sheetOpen.value = !sheetOpen.value
}
export function openSheet() {
	sheetOpen.value = true
}
export function closeSheet() {
	sheetOpen.value = false
}
