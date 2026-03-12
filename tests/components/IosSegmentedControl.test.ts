import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// Mock useHaptic
vi.stubGlobal('useHaptic', () => ({
	triggerHaptic: vi.fn(),
}));

import IosSegmentedControl from '~/components/ui/ios/IosSegmentedControl.vue';

const options = [
	{ label: 'Day', value: 'day' },
	{ label: 'Week', value: 'week' },
	{ label: 'Month', value: 'month' },
];

describe('IosSegmentedControl', () => {
	it('renders all options as buttons', () => {
		const wrapper = mount(IosSegmentedControl, {
			props: { options, modelValue: 'day' },
		});
		const buttons = wrapper.findAll('.ios-segmented-button');
		expect(buttons).toHaveLength(3);
		expect(buttons[0].text()).toBe('Day');
		expect(buttons[1].text()).toBe('Week');
		expect(buttons[2].text()).toBe('Month');
	});

	it('marks active option with active class', () => {
		const wrapper = mount(IosSegmentedControl, {
			props: { options, modelValue: 'week' },
		});
		const buttons = wrapper.findAll('.ios-segmented-button');
		expect(buttons[1].classes()).toContain('active');
		expect(buttons[0].classes()).not.toContain('active');
	});

	it('sets aria-selected on active option', () => {
		const wrapper = mount(IosSegmentedControl, {
			props: { options, modelValue: 'month' },
		});
		const buttons = wrapper.findAll('.ios-segmented-button');
		expect(buttons[2].attributes('aria-selected')).toBe('true');
		expect(buttons[0].attributes('aria-selected')).toBe('false');
	});

	it('emits update:modelValue when a different option is clicked', async () => {
		const wrapper = mount(IosSegmentedControl, {
			props: { options, modelValue: 'day' },
		});
		await wrapper.findAll('.ios-segmented-button')[2].trigger('click');
		expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['month']);
	});

	it('does not emit when the already-active option is clicked', async () => {
		const wrapper = mount(IosSegmentedControl, {
			props: { options, modelValue: 'day' },
		});
		await wrapper.findAll('.ios-segmented-button')[0].trigger('click');
		expect(wrapper.emitted('update:modelValue')).toBeUndefined();
	});

	it('renders the sliding indicator', () => {
		const wrapper = mount(IosSegmentedControl, {
			props: { options, modelValue: 'day' },
		});
		const indicator = wrapper.find('.ios-segmented-indicator');
		expect(indicator.exists()).toBe(true);
	});

	it('has tablist role', () => {
		const wrapper = mount(IosSegmentedControl, {
			props: { options, modelValue: 'day' },
		});
		expect(wrapper.find('.ios-segmented').attributes('role')).toBe('tablist');
	});
});
