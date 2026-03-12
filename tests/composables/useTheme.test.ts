import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, readonly } from 'vue';

// Mock Nuxt auto-imports
vi.stubGlobal('useState', (key: string, init: () => string) => ref(init()));
vi.stubGlobal('readonly', readonly);

// Mock import.meta.client
vi.stubGlobal('import', { meta: { client: true } });

// We need to handle import.meta.client — vitest transforms it
// So we mock at the module level
const mockLocalStorage = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] ?? null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		clear: () => {
			store = {};
		},
	};
})();

Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, configurable: true });

import { useTheme } from '~/composables/useTheme';

describe('useTheme', () => {
	beforeEach(() => {
		mockLocalStorage.clear();
		vi.clearAllMocks();
		document.documentElement.removeAttribute('data-theme');
	});

	it('returns themes array with 4 themes', () => {
		const { themes } = useTheme();
		expect(themes).toHaveLength(4);
		expect(themes.map((t) => t.id)).toEqual(['earnest', 'midnight', 'dawn', 'ocean']);
	});

	it('each theme has required properties', () => {
		const { themes } = useTheme();
		for (const theme of themes) {
			expect(theme).toHaveProperty('id');
			expect(theme).toHaveProperty('name');
			expect(theme).toHaveProperty('description');
			expect(theme).toHaveProperty('swatches');
			expect(theme.swatches.length).toBeGreaterThanOrEqual(3);
		}
	});

	it('defaults to earnest theme', () => {
		const { currentTheme } = useTheme();
		expect(currentTheme.value).toBe('earnest');
	});

	it('setTheme ignores invalid theme ids', () => {
		const { setTheme, currentTheme } = useTheme();
		setTheme('nonexistent');
		expect(currentTheme.value).toBe('earnest');
	});

	it('provides setTheme and initTheme functions', () => {
		const { setTheme, initTheme } = useTheme();
		expect(typeof setTheme).toBe('function');
		expect(typeof initTheme).toBe('function');
	});
});
