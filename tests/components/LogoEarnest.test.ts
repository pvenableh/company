import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LogoEarnest from '~/components/LogoEarnest.vue';

describe('LogoEarnest', () => {
	it('renders the Earnest wordmark', () => {
		const wrapper = mount(LogoEarnest);
		expect(wrapper.text()).toContain('Earnest');
		expect(wrapper.text()).toContain('.');
	});

	it('applies sm size class', () => {
		const wrapper = mount(LogoEarnest, { props: { size: 'sm' } });
		expect(wrapper.find('.earnest-wordmark').classes()).toContain('earnest-sm');
	});

	it('applies md size class by default', () => {
		const wrapper = mount(LogoEarnest);
		expect(wrapper.find('.earnest-wordmark').classes()).toContain('earnest-md');
	});

	it('applies lg size class', () => {
		const wrapper = mount(LogoEarnest, { props: { size: 'lg' } });
		expect(wrapper.find('.earnest-wordmark').classes()).toContain('earnest-lg');
	});

	it('applies xl size class', () => {
		const wrapper = mount(LogoEarnest, { props: { size: 'xl' } });
		expect(wrapper.find('.earnest-wordmark').classes()).toContain('earnest-xl');
	});

	it('has the period element with primary color class', () => {
		const wrapper = mount(LogoEarnest);
		const period = wrapper.find('.earnest-wordmark__period');
		expect(period.exists()).toBe(true);
		expect(period.text()).toBe('.');
	});
});
