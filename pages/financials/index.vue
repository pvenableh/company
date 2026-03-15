<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });

const router = useRouter();

const sections = [
  {
    name: 'Quarterly Analysis',
    description: 'Revenue, expenses, and financial overview',
    icon: 'lucide:bar-chart-3',
    route: '/command-center/financials',
    color: 'text-emerald-400',
  },
  {
    name: 'Products & Services',
    description: 'Manage products and services for invoicing',
    icon: 'lucide:package',
    route: '/financials/products',
    color: 'text-blue-400',
  },
  {
    name: 'Invoices',
    description: 'Create, manage, and track invoices',
    icon: 'lucide:file-text',
    route: '/invoices',
    color: 'text-amber-400',
  },
  {
    name: 'Payments',
    description: 'View payment history and status',
    icon: 'lucide:credit-card',
    route: '/invoices/payments',
    color: 'text-purple-400',
  },
];
</script>

<template>
  <div class="p-4 md:p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold">Financials</h1>
        <p class="text-sm text-muted-foreground">Financial tools and reports</p>
      </div>
    </div>

    <!-- Section grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div
        v-for="section in sections"
        :key="section.route"
        class="ios-card p-5 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all group"
        @click="router.push(section.route)"
      >
        <div class="flex items-start gap-4">
          <div class="shrink-0 w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center">
            <Icon :name="section.icon" :class="[section.color, 'w-5 h-5']" />
          </div>
          <div>
            <h3 class="text-sm font-medium group-hover:text-foreground transition-colors">{{ section.name }}</h3>
            <p class="text-xs text-muted-foreground mt-0.5">{{ section.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Quarterly Analysis inline -->
    <div class="mt-8">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">Quarterly Overview</h2>
      <CommandCenterFinancialQuarter />
    </div>
  </div>
</template>
