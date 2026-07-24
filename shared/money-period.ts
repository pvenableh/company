/*
  money-period — the date windows the financial-clarity graphics can be scoped
  to. Deliberately used ONLY for *flow* metrics (money collected/banked in the
  window); current-state AR (outstanding/overdue) and open pipeline (in-play/
  cold) are always "as of now", so they never take a period.
*/

export type MoneyPeriodKey = '7d' | '30d' | 'mtd' | 'qtd' | 'ytd' | 'all';

export interface MoneyPeriod {
	key: MoneyPeriodKey;
	/** Full label for menus / annotations. */
	label: string;
	/** Compact label for the pill selector. */
	short: string;
}

export const MONEY_PERIODS: MoneyPeriod[] = [
	{ key: '7d', label: 'Past 7 days', short: '7D' },
	{ key: '30d', label: 'Past 30 days', short: '30D' },
	{ key: 'mtd', label: 'This month', short: 'MTD' },
	{ key: 'qtd', label: 'This quarter', short: 'QTD' },
	{ key: 'ytd', label: 'Year to date', short: 'YTD' },
	{ key: 'all', label: 'Lifetime', short: 'All' },
];

export function moneyPeriodMeta(key: MoneyPeriodKey): MoneyPeriod {
	return MONEY_PERIODS.find((p) => p.key === key) ?? MONEY_PERIODS[4];
}

/**
 * Resolve a period key to a concrete [start, end] range. `start` is null for
 * `all` (lifetime — no lower bound). `end` is always "now".
 */
export function moneyPeriodRange(key: MoneyPeriodKey, now: Date = new Date()): { start: Date | null; end: Date } {
	const end = now;
	const startOfDay = (d: Date) => {
		const x = new Date(d);
		x.setHours(0, 0, 0, 0);
		return x;
	};
	switch (key) {
		case '7d': {
			const s = startOfDay(now);
			s.setDate(s.getDate() - 6); // inclusive of today → 7 calendar days
			return { start: s, end };
		}
		case '30d': {
			const s = startOfDay(now);
			s.setDate(s.getDate() - 29);
			return { start: s, end };
		}
		case 'mtd':
			return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
		case 'qtd': {
			const q = Math.floor(now.getMonth() / 3) * 3;
			return { start: new Date(now.getFullYear(), q, 1), end };
		}
		case 'ytd':
			return { start: new Date(now.getFullYear(), 0, 1), end };
		case 'all':
		default:
			return { start: null, end };
	}
}

/** True when `date` falls inside the range (start inclusive, end inclusive). */
export function inMoneyPeriod(
	date: string | Date | null | undefined,
	range: { start: Date | null; end: Date },
): boolean {
	if (!date) return false;
	const d = typeof date === 'string' ? new Date(date) : date;
	if (Number.isNaN(d.getTime())) return false;
	if (range.start && d < range.start) return false;
	return d <= range.end;
}
