import { describe, it, expect } from 'vitest';
import {
	generateSlots,
	zonedWallTimeToUtc,
	isIntervalFree,
	type HostAvailabilityInput,
} from '~~/server/utils/availability-engine';

function host(partial: Partial<HostAvailabilityInput>): HostAvailabilityInput {
	return {
		hostUserId: 'host-1',
		timezone: 'America/New_York',
		weeklyRules: [],
		bufferBefore: 0,
		bufferAfter: 0,
		internalBusy: [],
		externalBusy: [],
		dailyLimit: null,
		existingDailyCounts: {},
		...partial,
	};
}

describe('zonedWallTimeToUtc', () => {
	it('maps EST wall time to UTC (winter, UTC-5)', () => {
		// 2026-01-07 09:00 America/New_York (EST) → 14:00 UTC
		expect(zonedWallTimeToUtc(2026, 1, 7, 9, 0, 'America/New_York').toISOString()).toBe(
			'2026-01-07T14:00:00.000Z',
		);
	});
	it('maps EDT wall time to UTC (summer, UTC-4)', () => {
		// 2026-07-08 09:00 America/New_York (EDT) → 13:00 UTC
		expect(zonedWallTimeToUtc(2026, 7, 8, 9, 0, 'America/New_York').toISOString()).toBe(
			'2026-07-08T13:00:00.000Z',
		);
	});
	it('handles a west-coast tz', () => {
		expect(zonedWallTimeToUtc(2026, 1, 7, 9, 0, 'America/Los_Angeles').toISOString()).toBe(
			'2026-01-07T17:00:00.000Z',
		);
	});
});

describe('generateSlots — basic', () => {
	it('grids a working window in the host timezone', () => {
		const slots = generateSlots({
			hosts: [host({ weeklyRules: [{ day_of_week: 'Wednesday', start_time: '09:00:00', end_time: '12:00:00' }] })],
			durationMinutes: 30,
			intervalMinutes: 30,
			minNoticeMinutes: 0,
			horizonDays: 30,
			rangeStart: new Date('2026-01-07T00:00:00Z'), // Wednesday
			rangeEnd: new Date('2026-01-08T00:00:00Z'),
			now: new Date('2026-01-01T00:00:00Z'),
		});
		// 9:00, 9:30, 10:00, 10:30, 11:00, 11:30
		expect(slots).toHaveLength(6);
		expect(slots[0]!.start.toISOString()).toBe('2026-01-07T14:00:00.000Z'); // 09:00 EST
		expect(slots[5]!.start.toISOString()).toBe('2026-01-07T16:30:00.000Z'); // 11:30 EST
	});

	it('respects a DST-spring-forward day (offset re-check)', () => {
		// 2026-03-08 is DST start in the US; 09:00 is already EDT (UTC-4).
		const slots = generateSlots({
			hosts: [host({ weeklyRules: [{ day_of_week: 'Sunday', start_time: '09:00:00', end_time: '11:00:00' }] })],
			durationMinutes: 60,
			intervalMinutes: 60,
			minNoticeMinutes: 0,
			horizonDays: 30,
			rangeStart: new Date('2026-03-08T00:00:00Z'),
			rangeEnd: new Date('2026-03-09T00:00:00Z'),
			now: new Date('2026-03-01T00:00:00Z'),
		});
		expect(slots).toHaveLength(2);
		expect(slots[0]!.start.toISOString()).toBe('2026-03-08T13:00:00.000Z'); // 09:00 EDT
		expect(slots[1]!.start.toISOString()).toBe('2026-03-08T14:00:00.000Z'); // 10:00 EDT
	});
});

describe('generateSlots — constraints', () => {
	const wed = { day_of_week: 'Wednesday', start_time: '09:00:00', end_time: '12:00:00' };

	it('excludes slots colliding with a buffered busy block', () => {
		const slots = generateSlots({
			hosts: [
				host({
					weeklyRules: [wed],
					bufferBefore: 15,
					bufferAfter: 15,
					// 10:00–10:30 EST busy = 15:00Z–15:30Z; ±15m → blocks 09:45–10:45
					internalBusy: [{ start: new Date('2026-01-07T15:00:00Z'), end: new Date('2026-01-07T15:30:00Z') }],
				}),
			],
			durationMinutes: 30,
			intervalMinutes: 30,
			minNoticeMinutes: 0,
			horizonDays: 30,
			rangeStart: new Date('2026-01-07T00:00:00Z'),
			rangeEnd: new Date('2026-01-08T00:00:00Z'),
			now: new Date('2026-01-01T00:00:00Z'),
		});
		// 9:30, 10:00, 10:30 knocked out → 9:00, 11:00, 11:30 remain
		expect(slots.map((s) => s.start.toISOString())).toEqual([
			'2026-01-07T14:00:00.000Z',
			'2026-01-07T16:00:00.000Z',
			'2026-01-07T16:30:00.000Z',
		]);
	});

	it('excludes slots colliding with EXTERNAL (Google/Outlook) busy', () => {
		const slots = generateSlots({
			hosts: [
				host({
					weeklyRules: [wed],
					// external busy 10:00–11:00 EST = 15:00Z–16:00Z (e.g. a Google event)
					externalBusy: [{ start: new Date('2026-01-07T15:00:00Z'), end: new Date('2026-01-07T16:00:00Z') }],
				}),
			],
			durationMinutes: 30,
			intervalMinutes: 30,
			minNoticeMinutes: 0,
			horizonDays: 30,
			rangeStart: new Date('2026-01-07T00:00:00Z'),
			rangeEnd: new Date('2026-01-08T00:00:00Z'),
			now: new Date('2026-01-01T00:00:00Z'),
		});
		// 10:00 and 10:30 removed by the external event → 9:00, 9:30, 11:00, 11:30
		expect(slots.map((s) => s.start.toISOString())).toEqual([
			'2026-01-07T14:00:00.000Z',
			'2026-01-07T14:30:00.000Z',
			'2026-01-07T16:00:00.000Z',
			'2026-01-07T16:30:00.000Z',
		]);
	});

	it('applies minimum notice', () => {
		const slots = generateSlots({
			hosts: [host({ weeklyRules: [wed] })],
			durationMinutes: 30,
			intervalMinutes: 30,
			minNoticeMinutes: 120,
			horizonDays: 30,
			rangeStart: new Date('2026-01-07T00:00:00Z'),
			rangeEnd: new Date('2026-01-08T00:00:00Z'),
			now: new Date('2026-01-07T13:00:00Z'), // 08:00 EST → earliest bookable 10:00 EST
		});
		// 10:00, 10:30, 11:00, 11:30
		expect(slots).toHaveLength(4);
		expect(slots[0]!.start.toISOString()).toBe('2026-01-07T15:00:00.000Z');
	});

	it('honours a break window', () => {
		const slots = generateSlots({
			hosts: [host({ weeklyRules: [{ ...wed, break_start: '10:00:00', break_end: '11:00:00' }] })],
			durationMinutes: 30,
			intervalMinutes: 30,
			minNoticeMinutes: 0,
			horizonDays: 30,
			rangeStart: new Date('2026-01-07T00:00:00Z'),
			rangeEnd: new Date('2026-01-08T00:00:00Z'),
			now: new Date('2026-01-01T00:00:00Z'),
		});
		// 10:00 and 10:30 removed → 9:00, 9:30, 11:00, 11:30
		expect(slots).toHaveLength(4);
	});

	it('suppresses a day at its daily booking cap', () => {
		const slots = generateSlots({
			hosts: [host({ weeklyRules: [wed], dailyLimit: 3, existingDailyCounts: { '2026-01-07': 3 } })],
			durationMinutes: 30,
			intervalMinutes: 30,
			minNoticeMinutes: 0,
			horizonDays: 30,
			rangeStart: new Date('2026-01-07T00:00:00Z'),
			rangeEnd: new Date('2026-01-08T00:00:00Z'),
			now: new Date('2026-01-01T00:00:00Z'),
		});
		expect(slots).toHaveLength(0);
	});
});

describe('generateSlots — pooled', () => {
	const wed = { day_of_week: 'Wednesday', start_time: '09:00:00', end_time: '10:00:00' };
	const base = {
		durationMinutes: 30,
		intervalMinutes: 30,
		minNoticeMinutes: 0,
		horizonDays: 30,
		rangeStart: new Date('2026-01-07T00:00:00Z'),
		rangeEnd: new Date('2026-01-08T00:00:00Z'),
		now: new Date('2026-01-01T00:00:00Z'),
	};

	it('round_robin unions hosts and picks a candidate host', () => {
		const slots = generateSlots({
			...base,
			schedulingType: 'round_robin',
			hosts: [
				host({ hostUserId: 'a', weeklyRules: [wed] }),
				host({
					hostUserId: 'b',
					weeklyRules: [wed],
					// b busy 09:00–09:30 EST → only 09:30 free for b
					internalBusy: [{ start: new Date('2026-01-07T14:00:00Z'), end: new Date('2026-01-07T14:30:00Z') }],
				}),
			],
		});
		// Two distinct start times (09:00, 09:30); each carries a chosen host.
		expect(slots).toHaveLength(2);
		expect(slots.every((s) => s.hostUserId)).toBe(true);
	});

	it('collective intersects hosts', () => {
		const slots = generateSlots({
			...base,
			schedulingType: 'collective',
			hosts: [
				host({ hostUserId: 'a', weeklyRules: [wed] }),
				host({
					hostUserId: 'b',
					weeklyRules: [wed],
					internalBusy: [{ start: new Date('2026-01-07T14:00:00Z'), end: new Date('2026-01-07T14:30:00Z') }],
				}),
			],
		});
		// Only 09:30 works for both.
		expect(slots).toHaveLength(1);
		expect(slots[0]!.start.toISOString()).toBe('2026-01-07T14:30:00.000Z');
	});
});

describe('isIntervalFree', () => {
	it('detects overlap with buffers', () => {
		const busy = [{ start: new Date('2026-01-07T15:00:00Z'), end: new Date('2026-01-07T15:30:00Z') }];
		expect(isIntervalFree(new Date('2026-01-07T14:00:00Z'), new Date('2026-01-07T14:30:00Z'), busy)).toBe(true);
		expect(isIntervalFree(new Date('2026-01-07T14:45:00Z'), new Date('2026-01-07T15:15:00Z'), busy)).toBe(false);
		// buffer pushes a 14:30–15:00 slot into conflict
		expect(isIntervalFree(new Date('2026-01-07T14:30:00Z'), new Date('2026-01-07T15:00:00Z'), busy, 15, 15)).toBe(false);
	});
});
