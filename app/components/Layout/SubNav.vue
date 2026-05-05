<script setup lang="ts">
import type { WorkspaceContext } from '@/composables/useContextualHat'

const route = useRoute()
const { currentContext } = useContextualHat()

type SubNavItem = { label: string; to: string; icon: string }

const subNavs: Partial<Record<WorkspaceContext, SubNavItem[]>> = {
  work: [
    { label: 'Projects', to: '/projects', icon: 'lucide:gantt-chart' },
    { label: 'Tickets', to: '/tickets', icon: 'heroicons:queue-list' },
    { label: 'Tasks', to: '/tasks', icon: 'heroicons:clipboard-document-check' },
    { label: 'Scheduler', to: '/scheduler', icon: 'heroicons:calendar-date-range' },
    { label: 'Files', to: '/files', icon: 'heroicons:folder-open' },
    { label: 'Goals', to: '/goals', icon: 'lucide:target' },
  ],
  pipeline: [
    { label: 'Leads', to: '/leads', icon: 'heroicons:funnel' },
    { label: 'Proposals', to: '/proposals', icon: 'heroicons:document-check' },
    { label: 'Contracts', to: '/contracts', icon: 'lucide:file-signature' },
    { label: 'Clients', to: '/clients', icon: 'heroicons:building-storefront' },
    { label: 'Contacts', to: '/contacts', icon: 'heroicons:identification' },
    { label: 'People', to: '/people', icon: 'heroicons:user-group' },
  ],
  financials: [
    { label: 'Invoices', to: '/invoices', icon: 'heroicons:document-text' },
    { label: 'Expenses', to: '/expenses', icon: 'lucide:receipt' },
    { label: 'Payouts', to: '/payouts', icon: 'lucide:banknote' },
    { label: 'Financials', to: '/financials', icon: 'heroicons:chart-bar' },
  ],
  engage: [
    { label: 'Marketing', to: '/marketing', icon: 'lucide:megaphone' },
    { label: 'Email', to: '/email', icon: 'lucide:mail' },
    { label: 'Social', to: '/social', icon: 'lucide:share-2' },
  ],
  team: [
    { label: 'Channels', to: '/channels', icon: 'heroicons:chat-bubble-left-right' },
    { label: 'Teams', to: '/organization/teams', icon: 'heroicons:users' },
  ],
}

const items = computed<SubNavItem[]>(() => subNavs[currentContext.value] ?? [])

function isActive(item: SubNavItem): boolean {
  const path = route.path
  if (path === item.to) return true
  return path.startsWith(`${item.to}/`)
}
</script>

<template>
  <nav
    v-if="items.length"
    class="flex items-center gap-1 px-4 lg:px-6 h-10 shrink-0 border-b border-border/40 bg-background/60 overflow-x-auto"
  >
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="sub-nav-pill"
      :class="isActive(item) ? 'sub-nav-pill-active' : 'sub-nav-pill-inactive'"
    >
      <Icon :name="item.icon" class="w-3.5 h-3.5" />
      <span class="text-[12px] font-medium">{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.sub-nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 9999px;
  white-space: nowrap;
  transition:
    background 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    color 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.sub-nav-pill-active {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.sub-nav-pill-inactive {
  color: hsl(var(--muted-foreground));
}

.sub-nav-pill-inactive:hover {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
}
</style>
