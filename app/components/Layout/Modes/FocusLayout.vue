<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const props = defineProps<{
	user?: Record<string, any>
}>()

const emit = defineEmits<{
	'open-spotlight': []
	'open-ai-tray': []
	'open-timer': []
}>()

const config = useRuntimeConfig()
const route = useRoute()

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

interface RailItem {
	name: string
	to: string
	icon: string
}

const railItems: RailItem[] = [
	{ name: 'Inbox', to: '/', icon: 'lucide:inbox' },
	{ name: 'Tickets', to: '/tickets', icon: 'heroicons:queue-list' },
	{ name: 'Clients', to: '/clients', icon: 'heroicons:building-storefront' },
	{ name: 'Leads', to: '/leads', icon: 'heroicons:funnel' },
	{ name: 'Projects', to: '/projects', icon: 'lucide:gantt-chart' },
	{ name: 'Scheduler', to: '/scheduler', icon: 'heroicons:calendar-date-range' },
	{ name: 'Invoices', to: '/invoices', icon: 'heroicons:document-text' },
]

function isActiveItem(to: string): boolean {
	if (to === '/') return route.path === '/'
	return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
	<div class="flex h-screen bg-background">
		<!-- ─── Slim icon rail (desktop) ─── -->
		<aside class="hidden md:flex flex-col w-14 shrink-0 border-r border-border/40 bg-sidebar-background z-50">
			<!-- Logo / Inbox home -->
			<NuxtLink to="/" class="flex items-center justify-center h-12 shrink-0">
				<LogoEarnest size="sm" />
			</NuxtLink>

			<!-- Primary nav -->
			<nav class="flex-1 flex flex-col items-center gap-1 py-2">
				<NuxtLink
					v-for="item in railItems"
					:key="item.to"
					:to="item.to"
					:data-tooltip="item.name"
					class="rail-btn has-tooltip"
					:class="{ 'rail-btn-active': isActiveItem(item.to) }"
				>
					<Icon :name="item.icon" class="w-4 h-4" />
				</NuxtLink>
			</nav>

			<!-- Footer: AI + avatar -->
			<div class="flex flex-col items-center gap-1 pb-3">
				<button
					@click="emit('open-ai-tray')"
					data-tooltip="Earnest AI"
					class="rail-btn has-tooltip"
				>
					<Icon name="lucide:sparkles" class="w-4 h-4" />
				</button>
				<NuxtLink v-if="user" to="/account" class="shrink-0 mt-1">
					<Avatar class="size-7">
						<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
						<AvatarFallback class="text-[10px] font-semibold">{{ initials }}</AvatarFallback>
					</Avatar>
				</NuxtLink>
			</div>
		</aside>

		<!-- ─── Main column ─── -->
		<div class="flex-1 flex flex-col min-w-0">
			<!-- Slim header -->
			<header class="glass flex items-center justify-between border-b border-border/40 px-3 sm:px-4 h-12 shrink-0 z-40">
				<div class="flex items-center gap-1 min-w-0">
					<NuxtLink to="/" class="md:hidden flex items-center">
						<LogoEarnest size="sm" />
					</NuxtLink>
				</div>
				<div class="flex items-center gap-1.5">
					<button
						class="flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-muted/40 hover:bg-muted/60 text-muted-foreground transition-colors text-[11px]"
						@click="emit('open-spotlight')"
					>
						<Icon name="lucide:search" class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Search</span>
						<kbd class="hidden sm:inline text-[9px] font-medium opacity-70 ml-1">⌘K</kbd>
					</button>
					<LayoutNotificationsMenu />
				</div>
			</header>

			<!-- Page content -->
			<main class="flex-1 overflow-auto">
				<slot />
			</main>
		</div>

		<!-- ─── Mobile bottom rail ─── -->
		<nav class="md:hidden fixed bottom-0 left-0 right-0 h-14 border-t border-border/40 bg-sidebar-background z-40 flex items-center justify-around px-2">
			<NuxtLink
				v-for="item in railItems.slice(0, 5)"
				:key="item.to"
				:to="item.to"
				class="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-muted-foreground"
				:class="{ 'text-primary': isActiveItem(item.to) }"
			>
				<Icon :name="item.icon" class="w-4 h-4" />
				<span class="text-[9px] font-medium">{{ item.name }}</span>
			</NuxtLink>
		</nav>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.rail-btn {
	@apply flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors relative;
}

.rail-btn-active {
	@apply bg-primary/10 text-primary;
}

.has-tooltip::after {
	content: attr(data-tooltip);
	position: absolute;
	left: 100%;
	margin-left: 0.5rem;
	padding: 0.25rem 0.5rem;
	border-radius: 0.375rem;
	background: hsl(var(--popover));
	color: hsl(var(--popover-foreground));
	font-size: 11px;
	font-weight: 500;
	white-space: nowrap;
	box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
	border: 1px solid hsl(var(--border) / 0.4);
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.15s;
	z-index: 60;
}

.has-tooltip:hover::after {
	opacity: 1;
}
</style>
