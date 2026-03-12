import { describe, it, expect, beforeEach } from 'vitest';
import {
	screen,
	loader,
	sheetOpen,
	toggleScreen,
	closeScreen,
	openScreen,
	toggleSheet,
	openSheet,
	closeSheet,
} from '~/composables/useScreen';

describe('useScreen', () => {
	beforeEach(() => {
		screen.value = false;
		loader.value = false;
		sheetOpen.value = false;
	});

	describe('screen controls', () => {
		it('toggleScreen flips screen state', () => {
			expect(screen.value).toBe(false);
			toggleScreen();
			expect(screen.value).toBe(true);
			toggleScreen();
			expect(screen.value).toBe(false);
		});

		it('openScreen sets screen to true', () => {
			openScreen();
			expect(screen.value).toBe(true);
		});

		it('closeScreen sets screen and loader to false', () => {
			screen.value = true;
			loader.value = true;
			closeScreen();
			expect(screen.value).toBe(false);
			expect(loader.value).toBe(false);
		});
	});

	describe('sheet controls', () => {
		it('toggleSheet flips sheetOpen state', () => {
			expect(sheetOpen.value).toBe(false);
			toggleSheet();
			expect(sheetOpen.value).toBe(true);
			toggleSheet();
			expect(sheetOpen.value).toBe(false);
		});

		it('openSheet sets sheetOpen to true', () => {
			openSheet();
			expect(sheetOpen.value).toBe(true);
		});

		it('closeSheet sets sheetOpen to false', () => {
			sheetOpen.value = true;
			closeSheet();
			expect(sheetOpen.value).toBe(false);
		});
	});
});
