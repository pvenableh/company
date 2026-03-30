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

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

// ── Breadcrumb computation ──
interface Breadcrumb {
	label: string
	to: string
}

const domainMap: Record<string, { parent?: { label: string; to: string }; label: string }> = {
	'/projects': { label: 'Projects' },
	'/tickets': { parent: { label: 'Projects', to: '/projects' }, label: 'Tickets' },
	'/tasks': { parent: { label: 'Projects', to: '/projects' }, label: 'Tasks' },
	'/scheduler': { parent: { label: 'Team', to: '/channels' }, label: 'Scheduler' },
	'/files': { label: 'Files' },
	'/goals': { label: 'Goals' },
	'/people': { parent: { label: 'Pipeline', to: '/people' }, label: 'People' },
	'/contacts': { parent: { label: 'Pipeline', to: '/people' }, label: 'Contacts' },
	'/clients': { parent: { label: 'Pipeline', to: '/people' }, label: 'Clients' },
	'/leads': { parent: { label: 'Pipeline', to: '/leads' }, label: 'Leads' },
	'/proposals': { parent: { label: 'Pipeline', to: '/leads' }, label: 'Proposals' },
	'/channels': { label: 'Team' },
	'/organization/teams': { parent: { label: 'Team', to: '/channels' }, label: 'Teams' },
	'/invoices': { parent: { label: 'Financials', to: '/invoices' }, label: 'Invoices' },
	'/expenses': { parent: { label: 'Financials', to: '/invoices' }, label: 'Expenses' },
	'/financials': { label: 'Financials' },
	'/payouts': { parent: { label: 'Financials', to: '/invoices' }, label: 'Payouts' },
	'/email': { parent: { label: 'Marketing', to: '/marketing' }, label: 'Email' },
	'/social': { parent: { label: 'Marketing', to: '/marketing' }, label: 'Social' },
	'/marketing': { label: 'Marketing' },
	'/command-center': { label: 'Command Center' },
	'/account': { label: 'Account' },
	'/activity': { label: 'Activity' },
	'/organization': { label: 'Organization' },
	'/time-tracker': { label: 'Time Tracker' },
}

const breadcrumbs = computed<Breadcrumb[]>(() => {
	const path = route.path
	if (path === '/') return []

	const crumbs: Breadcrumb[] = [{ label: 'Home', to: '/' }]

	// Find matching domain
	const matchingKey = Object.keys(domainMap)
		.sort((a, b) => b.length - a.length)
		.find((key) => path.startsWith(key))

	if (matchingKey) {
		const domain = domainMap[matchingKey]
		if (domain.parent) {
			crumbs.push({ label: domain.parent.label, to: domain.parent.to })
		}
		crumbs.push({ label: domain.label, to: matchingKey })

		// If we're deeper than the domain root, add a generic "Detail" crumb
		if (path !== matchingKey && path.length > matchingKey.length + 1) {
			crumbs.push({ label: 'Detail', to: path })
		}
	}

	return crumbs
})

const isHome = computed(() => route.path === '/')

const goBack = () => {
	if (breadcrumbs.value.length > 1) {
		const parentCrumb = breadcrumbs.value[breadcrumbs.value.length - 2]
		router.push(parentCrumb.to)
	} else {
		router.push('/')
	}
}

// ── Minibar items ──
const minibarItems = [
	{ id: 'home', icon: 'lucide:home', label: 'Home', to: '/' },
	{ id: 'timer', icon: 'heroicons:clock', label: 'Timer', action: () => emit('open-timer') },
	{ id: 'ai', icon: 'heroicons:sparkles', label: 'AI', to: '/command-center/ai' },
	{ id: 'search', icon: 'lucide:search', label: 'Search', action: () => emit('open-spotlight') },
]

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
</script>

<template>
	<div class="flex flex-col h-screen bg-background">
		<!-- ─── Header with breadcrumbs ─── -->
		<header class="glass flex items-center justify-between border-b border-border/40 px-4 lg:px-6 h-12 shrink-0 z-40">
			<!-- Left: Back + Breadcrumbs -->
			<div class="flex items-center gap-2 min-w-0 flex-1">
				<button
					v-if="!isHome"
					@click="goBack"
					class="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors shrink-0"
				>
					<Icon name="lucide:arrow-left" class="w-4 h-4" />
				</button>

				<!-- Breadcrumbs -->
				<nav v-if="breadcrumbs.length" class="flex items-center gap-1 min-w-0 text-[12px]">
					<template v-for="(crumb, i) in breadcrumbs" :key="crumb.to">
						<NuxtLink
							:to="crumb.to"
							class="text-muted-foreground hover:text-foreground transition-colors truncate"
							:class="i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''"
						>
							{{ crumb.label }}
						</NuxtLink>
						<Icon
							v-if="i < breadcrumbs.length - 1"
							name="lucide:chevron-right"
							class="w-3 h-3 text-muted-foreground/50 shrink-0"
						/>
					</template>
				</nav>

				<!-- Home state: just show logo -->
				<NuxtLink v-else to="/" class="flex items-center">
					<LogoEarnest size="sm" />
				</NuxtLink>
			</div>

			<!-- Right: Context + Notifications + Avatar -->
			<div class="flex items-center gap-2 shrink-0">
				<LayoutContextPill />
				<LayoutNotificationsMenu />
				<NuxtLink v-if="user" to="/account" class="shrink-0">
					<Avatar class="size-7">
						<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
						<AvatarFallback class="text-xs font-semibold">{{ initials }}</AvatarFallback>
					</Avatar>
				</NuxtLink>
			</div>
		</header>

		<!-- ─── Main Content ─── -->
		<main class="flex-1 overflow-auto pb-16">
			<slot />
		</main>

		<!-- ─── Minibar ─── -->
		<nav
			class="fixed bottom-0 inset-x-0 z-40 glass border-t border-border/40"
			:class="'minibar'"
		>
			<div class="flex items-center justify-center gap-1 h-full max-w-xs mx-auto">
				<template v-for="item in minibarItems" :key="item.id">
					<NuxtLink
						v-if="item.to"
						:to="item.to"
						class="minibar-item"
						:class="{ 'minibar-item-active': route.path === item.to }"
					>
						<Icon :name="item.icon" class="w-5 h-5" />
						<span class="text-[9px] font-medium">{{ item.label }}</span>
					</NuxtLink>
					<button
						v-else
						@click="item.action?.()"
						class="minibar-item"
					>
						<Icon :name="item.icon" class="w-5 h-5" />
						<span class="text-[9px] font-medium">{{ item.label }}</span>
					</button>
				</template>
			</div>
		</nav>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* ── Minibar ── */
.minibar {
	height: calc(48px + env(safe-area-inset-bottom, 0px));
	padding-bottom: env(safe-area-inset-bottom, 0px);
}

@media (min-width: 768px) {
	.minibar {
		height: 40px;
		padding-bottom: 0;
	}
}

.minibar-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	padding: 4px 16px;
	border-radius: 12px;
	color: hsl(var(--muted-foreground));
	transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	-webkit-tap-highlight-color: transparent;
	text-decoration: none;
}

.minibar-item:hover {
	color: hsl(var(--foreground));
	background: hsl(var(--muted) / 0.4);
}

.minibar-item:active {
	transform: scale(0.9);
}

.minibar-item-active {
	color: hsl(var(--foreground));
}
</style>
