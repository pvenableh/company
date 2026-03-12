import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// Mock useHaptic
vi.stubGlobal('useHaptic', () => ({
	triggerHaptic: vi.fn(),
}));

import IosToggle from '~/components/ui/ios/IosToggle.vue';

describe('IosToggle', () => {
	it('renders a button with switch role', () => {
		const wrapper = mount(IosToggle, { props: { modelValue: false } });
		const button = wrapper.find('button');
		expect(button.attributes('role')).toBe('switch');
	});

	it('reflects off state via aria-checked', () => {
		const wrapper = mount(IosToggle, { props: { modelValue: false } });
		expect(wrapper.find('button').attributes('aria-checked')).toBe('false');
	});

	it('reflects on state via aria-checked and class', () => {
		const wrapper = mount(IosToggle, { props: { modelValue: true } });
		expect(wrapper.find('button').attributes('aria-checked')).toBe('true');
		expect(wrapper.find('button').classes()).toContain('on');
	});

	it('emits update:modelValue with toggled value on click', async () => {
		const wrapper = mount(IosToggle, { props: { modelValue: false } });
		await wrapper.find('button').trigger('click');
		expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
	});

	it('emits false when currently true', async () => {
		const wrapper = mount(IosToggle, { props: { modelValue: true } });
		await wrapper.find('button').trigger('click');
		expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
	});

	it('contains the knob element', () => {
		const wrapper = mount(IosToggle, { props: { modelValue: false } });
		expect(wrapper.find('.ios-toggle-knob').exists()).toBe(true);
	});
});
