<!--
  /preview/money-pipeline — a shareable, in-app design preview of the Money
  Pipeline reporting. It renders the REAL <MoneyPipeline> / <MoneyHuntList>
  components (the ones shipped on the project, client, and Money → Insights
  surfaces) with representative sample data, so this page can never drift from
  what the product actually shows. Public (auth:false) + standalone (layout:
  false) so it can be shared like a pitch page. Sample figures only — no live
  data is read here.
-->
<script setup lang="ts">
definePageMeta({ layout: false, auth: false });
useHead({ title: 'Money Pipeline — Preview' });

// Dates are computed at render so the "Nd overdue" / "due in Nd" labels stay
// truthful whenever the page is opened.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const daysAhead = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// ── The whole studio (org altitude) ─────────────────────────────────────────
const studio = {
  contractValue: 486_000,
  paid: 214_000,
  currentOutstanding: 58_000,
  overdue: 52_000,
};
const studioHunt = [
  { id: 's1', who: 'Helios Hospitality Group', code: 'INV-AGY-HEL-0007', outstanding: 22_000, dueDate: daysAgo(120) },
  { id: 's2', who: 'Atlas Fintech',             code: 'INV-AGY-ATL-0019', outstanding: 18_000, dueDate: daysAgo(110) },
  { id: 's3', who: 'Meridian Law Group',        code: 'INV-AGY-MER-0011', outstanding: 12_000, dueDate: daysAgo(65) },
  { id: 's4', who: 'Helios Hospitality Group', code: 'INV-AGY-HEL-0021', outstanding: 36_000, dueDate: daysAhead(9) },
  { id: 's5', who: 'Atlas Fintech',             code: 'INV-AGY-ATL-0024', outstanding: 22_000, dueDate: daysAhead(21) },
];

// ── One client (client altitude — hunt rows are per-invoice) ─────────────────
const client = {
  contractValue: 210_000,
  paid: 96_000,
  currentOutstanding: 36_000,
  overdue: 22_000,
};
const clientHunt = [
  { id: 'c1', who: 'INV-AGY-HEL-0007', code: '', outstanding: 22_000, dueDate: daysAgo(120) },
  { id: 'c2', who: 'INV-AGY-HEL-0021', code: '', outstanding: 36_000, dueDate: daysAhead(9) },
];

// ── One project (project altitude) ──────────────────────────────────────────
const project = {
  contractValue: 140_000,
  paid: 60_000,
  currentOutstanding: 14_000,
  overdue: 10_000,
};
const projectHunt = [
  { id: 'p1', who: 'Helios Hospitality Group', code: 'INV-AGY-HEL-0007', outstanding: 10_000, dueDate: daysAgo(120) },
  { id: 'p2', who: 'Helios Hospitality Group', code: 'INV-AGY-HEL-0021', outstanding: 14_000, dueDate: daysAhead(9) },
];

const noop = () => {};
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <div class="mx-auto max-w-5xl px-5 py-12 sm:py-16">
      <!-- Masthead -->
      <header class="mb-10">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Earnest · Money</span>
          <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground rounded-full bg-muted/40 px-2 py-0.5">Design preview · sample data</span>
        </div>
        <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
          Every dollar, from signed to collected — and what's still out there to hunt down.
        </h1>
        <p class="mt-3 max-w-2xl text-sm sm:text-base text-muted-foreground">
          One visual language for the money question, repeated at three altitudes — the whole studio,
          each client, and each project. It splits a contract's value into four honest states so you
          always know what's paid, what's owed, and where to point your follow-up.
        </p>
      </header>

      <!-- Whole studio -->
      <section class="mb-10">
        <div class="flex items-center gap-3 mb-3">
          <h2 class="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">The whole studio</h2>
          <span class="flex-1 h-px bg-border/60" />
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <MoneyPipeline
            :contract-value="studio.contractValue"
            :paid="studio.paid"
            :current-outstanding="studio.currentOutstanding"
            :overdue="studio.overdue"
          />
          <MoneyHuntList :rows="studioHunt" @open="noop" />
        </div>
      </section>

      <!-- By client -->
      <section class="mb-10">
        <div class="flex items-center gap-3 mb-3">
          <h2 class="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">One client — where to point the effort</h2>
          <span class="flex-1 h-px bg-border/60" />
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <MoneyPipeline
            :contract-value="client.contractValue"
            :paid="client.paid"
            :current-outstanding="client.currentOutstanding"
            :overdue="client.overdue"
          />
          <MoneyHuntList :rows="clientHunt" @open="noop" />
        </div>
      </section>

      <!-- One project -->
      <section class="mb-10">
        <div class="flex items-center gap-3 mb-3">
          <h2 class="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">One project — the drill-down</h2>
          <span class="flex-1 h-px bg-border/60" />
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <MoneyPipeline
            :contract-value="project.contractValue"
            :paid="project.paid"
            :current-outstanding="project.currentOutstanding"
            :overdue="project.overdue"
          />
          <MoneyHuntList :rows="projectHunt" @open="noop" />
        </div>
      </section>

      <footer class="mt-12 border-t border-border/60 pt-5 text-xs text-muted-foreground max-w-2xl">
        Live on the project &amp; client detail Overviews and the Money → Insights floor. Paid /
        Outstanding / Overdue are computed from invoice payments, so a partly-paid invoice counts only
        its unpaid remainder toward the hunt. Figures on this page are illustrative.
      </footer>
    </div>
  </div>
</template>
