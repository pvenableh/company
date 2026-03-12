import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHaptic } from '~/composables/useHaptic';

describe('useHaptic', () => {
	let vibrateMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vibrateMock = vi.fn();
		Object.defineProperty(navigator, 'vibrate', {
			value: vibrateMock,
			writable: true,
			configurable: true,
		});
	});

	it('returns triggerHaptic function', () => {
		const { triggerHaptic } = useHaptic();
		expect(typeof triggerHaptic).toBe('function');
	});

	it('triggers light haptic by default', () => {
		const { triggerHaptic } = useHaptic();
		triggerHaptic();
		expect(vibrateMock).toHaveBeenCalledWith(10);
	});

	it('triggers named haptic patterns', () => {
		const { triggerHaptic } = useHaptic();

		triggerHaptic('light');
		expect(vibrateMock).toHaveBeenCalledWith(10);

		triggerHaptic('medium');
		expect(vibrateMock).toHaveBeenCalledWith(25);

		triggerHaptic('heavy');
		expect(vibrateMock).toHaveBeenCalledWith(50);

		triggerHaptic('success');
		expect(vibrateMock).toHaveBeenCalledWith([10, 30, 10]);

		triggerHaptic('warning');
		expect(vibrateMock).toHaveBeenCalledWith([15, 40, 15]);

		triggerHaptic('error');
		expect(vibrateMock).toHaveBeenCalledWith([10, 20, 10, 20, 10]);
	});

	it('accepts raw numeric pattern', () => {
		const { triggerHaptic } = useHaptic();
		triggerHaptic(100);
		expect(vibrateMock).toHaveBeenCalledWith(100);
	});

	it('accepts raw array pattern', () => {
		const { triggerHaptic } = useHaptic();
		triggerHaptic([50, 100, 50]);
		expect(vibrateMock).toHaveBeenCalledWith([50, 100, 50]);
	});

	it('does not throw when navigator.vibrate is missing', () => {
		Object.defineProperty(navigator, 'vibrate', {
			value: undefined,
			writable: true,
			configurable: true,
		});
		const { triggerHaptic } = useHaptic();
		expect(() => triggerHaptic('medium')).not.toThrow();
	});
});
