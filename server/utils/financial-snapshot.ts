// server/utils/financial-snapshot.ts
/**
 * Org-scoped financial snapshot for the Director's Office "money" analysis.
 *
 * Rolls up realized income (paid invoices, by invoice_date — matching the
 * FinancialQuarter dashboard so the numbers agree with what the user sees),
 * expenses, net, outstanding AR, a trailing-average forward projection, and a
 * rough recurring-retainer floor. Returns both structured metrics (for a compact
 * UI strip) and a formatted text block (for the LLM to reason over).
 *
 * Admin-client reads (caller has already membership-verified). Never throws — a
 * failed sub-query degrades to zeros so the meeting still opens.
 */
import { readItems } from '@directus/sdk';

export interface FinancialMonth {
  key: string;      // YYYY-MM
  label: string;    // e.g. "Feb"
  income: number;   // realized (paid invoices) that month
  expenses: number;
  net: number;
}

export interface FinancialSnapshot {
  months: FinancialMonth[];        // trailing window, chronological
  windowMonths: number;
  totals: { income: number; expenses: number; net: number };
  trailing: { income: number; expenses: number; net: number }; // avg per COMPLETED month
  projection: { horizonMonths: number; income: number; expenses: number; net: number };
  outstanding: { total: number; count: number; overdueTotal: number; overdueCount: number };
  recurring: { retainerProjects: number; estMonthlyFloor: number };
  expensesByCategory: { category: string; amount: number }[];
  /** Preformatted, LLM-ready summary of everything above. */
  text: string;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export async function buildFinancialSnapshot(
  directus: any,
  organizationId: string,
  now: Date,
  windowMonths = 6,
): Promise<FinancialSnapshot> {
  // Trailing window: the last `windowMonths` COMPLETED months + the current
  // (partial) month. Income/expense averages use completed months only so a
  // half-finished month doesn't drag the projection down.
  const buckets: FinancialMonth[] = [];
  const bucketIndex = new Map<string, number>();
  for (let i = windowMonths; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    bucketIndex.set(key, buckets.length);
    buckets.push({ key, label: MONTH_LABELS[d.getMonth()]!, income: 0, expenses: 0, net: 0 });
  }
  const windowStartIso = new Date(now.getFullYear(), now.getMonth() - windowMonths, 1)
    .toISOString().split('T')[0]!;
  const ri = readItems as any;

  const [paidInvoices, outstandingInvoices, expenses, retainers] = await Promise.all([
    // Realized income — paid invoices in the window, by invoice_date.
    directus.request(ri('invoices', {
      filter: {
        _and: [
          { status: { _eq: 'paid' } },
          { invoice_date: { _gte: windowStartIso } },
          { _or: [{ bill_to: { _eq: organizationId } }, { client: { organization: { _eq: organizationId } } }] },
        ],
      },
      fields: ['id', 'total_amount', 'invoice_date'],
      limit: 1000,
    })).catch(() => []) as Promise<any[]>,

    // Outstanding AR — all unpaid, regardless of date.
    directus.request(ri('invoices', {
      filter: {
        _and: [
          { status: { _in: ['pending', 'processing'] } },
          { _or: [{ bill_to: { _eq: organizationId } }, { client: { organization: { _eq: organizationId } } }] },
        ],
      },
      fields: ['id', 'total_amount', 'due_date'],
      limit: 1000,
    })).catch(() => []) as Promise<any[]>,

    // Expenses in the window (direct org scope).
    directus.request(ri('expenses', {
      filter: { _and: [{ organization: { _eq: organizationId } }, { date: { _gte: windowStartIso } }] },
      fields: ['id', 'amount', 'date', 'category'],
      limit: 2000,
    })).catch(() => []) as Promise<any[]>,

    // Active retainer projects → rough recurring floor.
    directus.request(ri('projects', {
      filter: {
        _and: [
          { organization: { _eq: organizationId } },
          { billing_type: { _in: ['hourly_retainer', 'fixed_fee'] } },
          { status: { _in: ['Pending', 'Scheduled', 'In Progress'] } },
        ],
      },
      fields: ['id', 'billing_type', 'contract_value', 'retainer_period', 'retainer_hours_per_period', 'retainer_hourly_rate'],
      limit: 200,
    })).catch(() => []) as Promise<any[]>,
  ]);

  // Bin income + expenses by month.
  for (const inv of paidInvoices) {
    const key = (inv.invoice_date || '').slice(0, 7);
    const idx = bucketIndex.get(key);
    if (idx != null) buckets[idx]!.income += Number(inv.total_amount) || 0;
  }
  const catTotals = new Map<string, number>();
  for (const ex of expenses) {
    const amt = Number(ex.amount) || 0;
    const key = (ex.date || '').slice(0, 7);
    const idx = bucketIndex.get(key);
    if (idx != null) buckets[idx]!.expenses += amt;
    const cat = (ex.category || 'other').toString();
    catTotals.set(cat, (catTotals.get(cat) || 0) + amt);
  }
  for (const b of buckets) b.net = b.income - b.expenses;

  // Completed months = every bucket except the current (last) one.
  const completed = buckets.slice(0, -1);
  const completedCount = Math.max(1, completed.length);
  const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0);
  const trailing = {
    income: sum(completed.map((b) => b.income)) / completedCount,
    expenses: sum(completed.map((b) => b.expenses)) / completedCount,
    net: sum(completed.map((b) => b.net)) / completedCount,
  };
  const horizonMonths = 3;
  const projection = {
    horizonMonths,
    income: trailing.income * horizonMonths,
    expenses: trailing.expenses * horizonMonths,
    net: trailing.net * horizonMonths,
  };

  const nowIso = now.toISOString().split('T')[0]!;
  const outstanding = {
    total: sum(outstandingInvoices.map((i) => Number(i.total_amount) || 0)),
    count: outstandingInvoices.length,
    overdueTotal: sum(outstandingInvoices.filter((i) => i.due_date && i.due_date < nowIso).map((i) => Number(i.total_amount) || 0)),
    overdueCount: outstandingInvoices.filter((i) => i.due_date && i.due_date < nowIso).length,
  };

  // Rough recurring floor: hourly retainers → hours × rate (÷3 for quarterly).
  let estMonthlyFloor = 0;
  for (const p of retainers) {
    if (p.billing_type === 'hourly_retainer' && p.retainer_hours_per_period && p.retainer_hourly_rate) {
      const perPeriod = Number(p.retainer_hours_per_period) * Number(p.retainer_hourly_rate);
      estMonthlyFloor += p.retainer_period === 'quarterly' ? perPeriod / 3 : perPeriod;
    }
  }
  const recurring = { retainerProjects: retainers.length, estMonthlyFloor };

  const expensesByCategory = [...catTotals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totals = {
    income: sum(buckets.map((b) => b.income)),
    expenses: sum(buckets.map((b) => b.expenses)),
    net: sum(buckets.map((b) => b.net)),
  };

  // ── Formatted LLM text ──
  const lines: string[] = [];
  lines.push('[Source: Financial Snapshot]');
  lines.push(`Window: last ${windowMonths} completed months + current (through ${nowIso}).`);
  lines.push('Realized income = PAID invoices by invoice_date; expenses = expenses.amount by date.');
  lines.push('');
  lines.push('MONTHLY (income / expenses / net):');
  for (const b of buckets) {
    lines.push(`  ${b.label} ${b.key.slice(0, 4)}: ${money(b.income)} / ${money(b.expenses)} / ${money(b.net)}`);
  }
  lines.push('');
  lines.push(`Trailing avg per completed month: income ${money(trailing.income)}, expenses ${money(trailing.expenses)}, net ${money(trailing.net)}.`);
  lines.push(`Naive ${horizonMonths}-month projection (trailing-avg run-rate): income ${money(projection.income)}, expenses ${money(projection.expenses)}, NET ${money(projection.net)}.`);
  lines.push(`Outstanding AR: ${money(outstanding.total)} across ${outstanding.count} invoice(s); ${money(outstanding.overdueTotal)} OVERDUE across ${outstanding.overdueCount}.`);
  if (recurring.retainerProjects > 0) {
    lines.push(`Recurring: ${recurring.retainerProjects} active retainer project(s), est. monthly retainer floor ~${money(recurring.estMonthlyFloor)} (hourly retainers only; rough).`);
  }
  if (expensesByCategory.length) {
    const top = expensesByCategory.slice(0, 5).map((c) => `${c.category} ${money(c.amount)}`).join(', ');
    lines.push(`Top expense categories (window): ${top}.`);
  }

  return {
    months: buckets,
    windowMonths,
    totals,
    trailing,
    projection,
    outstanding,
    recurring,
    expensesByCategory,
    text: lines.join('\n'),
  };
}
