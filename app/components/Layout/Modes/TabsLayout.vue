<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const props = defineProps<{
  user?: Record<string, any>
}>()

const emit = defineEmits<{
  'open-spotlight': []
  'open-ai-tray': []
}>()

const config = useRuntimeConfig()
const { currentContext } = useContextualHat()

// ── Tab definitions ──
const tabs = [
  {
    id: 'work',
    label: 'Work',
    icon: 'lucide:gantt-chart',
    to: '/projects',
    routes: ['/projects', '/tickets', '/tasks', '/scheduler', '/files', '/goals', '/time-tracker'],
  },
  {
    id: 'people',
    label: 'People',
    icon: 'heroicons:user-group',
    to: '/people',
    routes: ['/people', '/contacts', '/clients', '/leads', '/channels', '/organization/teams'],
  },
  {
    id: 'money',
    label: 'Money',
    icon: 'heroicons:document-text',
    to: '/invoices',
    routes: ['/invoices', '/proposals', '/expenses', '/financials', '/payouts'],
  },
  {
    id: 'engage',
    label: 'Engage',
    icon: 'lucide:bar-chart-3',
    to: '/marketing',
    routes: ['/email', '/social', '/marketing'],
  },
  {
    id: 'ai',
    label: 'Chat',
    icon: 'heroicons:sparkles',
    to: '/',
    routes: ['/command-center', '/'],
  },
] as const

// ── User avatar ──
const avatarUrl = computed(() => {
  if (!props.user?.avatar) return null
  return `${config.public.assetsUrl}${props.user.avatar}?key=avatar`
})

const initials = computed(() => {
  if (!props.user) return 'U'
  const first = props.user.first_name?.[0] ?? ''
  const last = props.user.last_name?.[0] ?? ''
  return (first + last).toUpperCase() || 'U'
})

// ── Active tab check ──
function isActive(tabId: string): boolean {
  return currentContext.value === tabId
}
</script>

<template>
  <div class="flex flex-col h-screen bg-background">
    <!-- ─── Desktop Header ─── -->
    <header
      class="glass hidden md:flex items-center justify-between border-b border-border/40 px-4 lg:px-6 h-14 shrink-0 z-40"
    >
      <!-- Left: Context pill (mobile) / inline selects (desktop) -->
      <div class="flex items-center min-w-0 w-48">
        <LayoutContextPill class="lg:hidden" />
        <ClientOnly>
          <div class="hidden lg:flex items-center gap-1">
            <LayoutClientSelect v-if="user" :user="user" />
            <LayoutTeamSelect v-if="user" />
          </div>
        </ClientOnly>
      </div>

      <!-- Center: Tab bar -->
      <nav class="flex items-center gap-1 rounded-full bg-muted/40 p-1">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.id"
          :to="tab.to"
          class="tab-pill"
          :class="isActive(tab.id) ? 'tab-pill-active' : 'tab-pill-inactive'"
        >
          <Icon :name="tab.icon" class="w-4 h-4" />
          <span class="text-[13px] font-medium">{{ tab.label }}</span>
        </NuxtLink>
      </nav>

      <!-- Right: Notifications + Avatar -->
      <div class="flex items-center justify-end gap-2 w-48">
        <button
          class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          title="Search"
          @click="emit('open-spotlight')"
        >
          <Icon name="lucide:search" class="w-4 h-4" />
        </button>

        <LayoutNotificationsMenu />

        <NuxtLink v-if="user" to="/account" class="shrink-0">
          <Avatar class="size-8 ring-2 ring-transparent hover:ring-primary/20 transition-all duration-200">
            <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
            <AvatarFallback class="text-xs font-semibold">{{ initials }}</AvatarFallback>
          </Avatar>
        </NuxtLink>
      </div>
    </header>

    <!-- ─── Mobile Header (minimal) ─── -->
    <header
      class="glass flex md:hidden items-center justify-between border-b border-border/40 px-4 h-12 shrink-0 z-40"
    >
      <LayoutContextPill />

      <div class="flex items-center gap-2">
        <button
          class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/60 text-muted-foreground"
          @click="emit('open-spotlight')"
        >
          <Icon name="lucide:search" class="w-4 h-4" />
        </button>
        <LayoutNotificationsMenu />
      </div>
    </header>

    <!-- ─── Sub-nav (per-context secondary pills, e.g. Engage → Marketing/Email/Social) ─── -->
    <LayoutSubNav />

    <!-- ─── Main Content — slot fills remaining height so footer pins to bottom on short pages ─── -->
    <main class="flex-1 overflow-auto pb-16 md:pb-0">
      <div class="min-h-full flex flex-col">
        <div class="flex-1">
          <slot />
        </div>
        <LayoutFooter />
      </div>
    </main>

    <!-- ─── Mobile Bottom Tab Bar ─── -->
    <nav
      class="md:hidden fixed bottom-0 inset-x-0 z-50 glass border-t border-border/40"
      :style="{ height: '56px', paddingBottom: 'env(safe-area-inset-bottom)' }"
    >
      <div class="flex items-center justify-around h-14 px-2">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.id"
          :to="tab.to"
          class="mobile-tab"
          :class="isActive(tab.id) ? 'mobile-tab-active' : 'mobile-tab-inactive'"
        >
          <span class="mobile-tab-icon-wrap" :class="{ 'mobile-tab-icon-wrap-active': isActive(tab.id) }">
            <Icon :name="tab.icon" class="w-5 h-5" />
          </span>
          <span class="text-[10px] font-medium leading-none mt-1">{{ tab.label }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* ── Desktop Tab Pills ── */
.tab-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  white-space: nowrap;
  transition:
    background 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    color 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.tab-pill:active {
  transform: scale(0.95);
}

.tab-pill-active {
  background: hsl(var(--foreground));
  color: hsl(var(--background));
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12), 0 1px 2px rgb(0 0 0 / 0.06);
}

.tab-pill-inactive {
  color: hsl(var(--muted-foreground));
}

.tab-pill-inactive:hover {
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--foreground));
}

/* ── Mobile Bottom Tabs ── */
.mobile-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 0;
  padding: 4px 0;
  -webkit-tap-highlight-color: transparent;
  transition: color 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.mobile-tab-active {
  color: hsl(var(--primary));
}

.mobile-tab-inactive {
  color: hsl(var(--muted-foreground));
}

.mobile-tab-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 24px;
  border-radius: 12px;
  transition:
    background 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.mobile-tab-icon-wrap-active {
  background: hsl(var(--primary) / 0.12);
  transform: scale(1.08);
}

.mobile-tab:active .mobile-tab-icon-wrap {
  transform: scale(0.88);
}
</style>
