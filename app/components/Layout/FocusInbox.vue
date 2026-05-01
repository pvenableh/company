<script setup lang="ts">
import { openAITray } from '~/composables/useAITray'
import { openTimeTrackerModal } from '~/composables/useTimeTrackerModal'

const router = useRouter()
const { user } = useDirectusAuth()

const { suggestions, isAnalyzing, analyze } = useAIProductivityEngine()
const { enabledModules } = useAIPreferences()
const { selectedOrg } = useOrganization()

// ── Workspace data ──
const { todayEvents } = useCalendarEvents()
const { activeTimer, elapsed, isTimerRunning, isTimerPaused, pauseTimer, resumeTimer, formatElapsed } = useTimeTracker()
const { state: earnestState, fetchState } = useEarnestScore()

onMounted(() => {
	if (user.value) {
		analyze(new Set(enabledModules.value))
		fetchState()
	}
})
watch([selectedOrg, user], () => {
	if (user.value) {
		analyze(new Set(enabledModules.value))
		fetchState()
	}
})

// ── Group items into Now / Today / Up Next ──
const nowItems = computed(() => suggestions.value.filter((s) => s.priority === 'urgent'))
const todayItems = computed(() => suggestions.value.filter((s) => s.priority === 'high'))
const upNextItems = computed(() => suggestions.value.filter((s) => s.priority === 'medium' || s.priority === 'low'))

const totalCount = computed(() => suggestions.value.length)

const groups = computed(() => [
	{ key: 'now', label: 'Now', items: nowItems.value, dot: 'bg-red-500' },
	{ key: 'today', label: 'Today', items: todayItems.value, dot: 'bg-amber-500' },
	{ key: 'upnext', label: 'Up Next', items: upNextItems.value, dot: 'bg-muted-foreground/40' },
].filter((g) => g.items.length > 0))

const todayLabel = computed(() => {
	const d = new Date()
	return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
})

const greeting = computed(() => {
	const h = new Date().getHours()
	if (h < 12) return 'Good morning'
	if (h < 18) return 'Good afternoon'
	return 'Good evening'
})

const firstName = computed(() => user.value?.first_name ?? '')

// ── Category icons ──
const categoryStyles: Record<string, { icon: string; color: string }> = {
	tasks: { icon: 'heroicons:clipboard-document-check', color: 'text-blue-500' },
	invoices: { icon: 'heroicons:document-text', color: 'text-emerald-500' },
	projects: { icon: 'lucide:gantt-chart', color: 'text-violet-500' },
	communication: { icon: 'heroicons:chat-bubble-left-right', color: 'text-cyan-500' },
	leads: { icon: 'heroicons:funnel', color: 'text-amber-500' },
	scheduling: { icon: 'heroicons:calendar-date-range', color: 'text-rose-500' },
	social: { icon: 'lucide:hash', color: 'text-pink-500' },
	phone: { icon: 'heroicons:phone', color: 'text-indigo-500' },
	carddesk: { icon: 'heroicons:credit-card', color: 'text-teal-500' },
	goals: { icon: 'heroicons:trophy', color: 'text-yellow-500' },
}

function styleFor(category: string) {
	return categoryStyles[category] ?? { icon: 'lucide:circle-dot', color: 'text-muted-foreground' }
}

function categoryLabel(category: string): string {
	return category.charAt(0).toUpperCase() + category.slice(1)
}

function relativeTime(timestamp: Date | string): string {
	const t = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
	const now = new Date()
	const diffMs = t.getTime() - now.getTime()
	const diffMin = Math.round(diffMs / 60000)
	const absMin = Math.abs(diffMin)
	if (absMin < 60) return diffMin >= 0 ? `${absMin}m` : `${absMin}m ago`
	const absHr = Math.round(absMin / 60)
	if (absHr < 24) return diffMin >= 0 ? `${absHr}h` : `${absHr}h ago`
	const absDay = Math.round(absHr / 24)
	if (absDay < 30) return diffMin >= 0 ? `${absDay}d` : `${absDay}d ago`
	return ''
}

function handleOpen(item: { actionRoute?: string; actionFn?: () => void }) {
	if (item.actionRoute) {
		router.push(item.actionRoute)
	} else if (item.actionFn) {
		item.actionFn()
	}
}

// ── Workspace panel: time formatting ──
const eventTime = (iso: string) => {
	return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

const visibleTodayEvents = computed(() => todayEvents.value.slice(0, 5))

// ── Ask Earnest input ──
const askInput = ref('')
function submitAsk() {
	const q = askInput.value.trim()
	if (!q) {
		openAITray()
		return
	}
	openAITray(q)
	askInput.value = ''
}
</script>

<template>
	<div class="flex min-h-full">
		<!-- ─── Main inbox column ─── -->
		<div class="flex-1 min-w-0">
			<div class="px-6 lg:px-10 py-6 lg:py-8 pb-20">
				<!-- Header -->
				<div class="flex items-end justify-between mb-7">
					<div>
						<h1 class="text-[22px] font-semibold text-foreground tracking-tight leading-none">
							{{ greeting }}<span v-if="firstName">, {{ firstName }}</span>
						</h1>
						<p class="text-[13px] text-muted-foreground mt-1.5">{{ todayLabel }}</p>
					</div>
					<div v-if="totalCount > 0" class="text-[11px] text-muted-foreground tabular-nums">
						{{ totalCount }} item{{ totalCount === 1 ? '' : 's' }}
					</div>
				</div>

				<!-- Loading -->
				<div v-if="isAnalyzing && suggestions.length === 0" class="space-y-2">
					<div v-for="i in 5" :key="i" class="h-11 rounded-lg bg-muted/30 animate-pulse" />
				</div>

				<!-- Empty -->
				<div v-else-if="totalCount === 0" class="rounded-2xl border border-border/40 bg-muted/10 px-6 py-12 text-center">
					<Icon name="lucide:inbox" class="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" />
					<p class="text-[14px] font-medium text-foreground">All clear</p>
					<p class="text-[12px] text-muted-foreground mt-1">No urgent items. Take a breath.</p>
				</div>

				<!-- Smart groups -->
				<div v-else class="space-y-7">
					<section v-for="group in groups" :key="group.key">
						<h2 class="group-label">
							<span class="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" :class="group.dot" />
							{{ group.label }}
							<span class="text-muted-foreground/60 font-normal ml-1.5">{{ group.items.length }}</span>
						</h2>
						<ul class="mt-2 divide-y divide-border/30 border-y border-border/30">
							<li v-for="item in group.items" :key="item.id">
								<button class="inbox-row group" @click="handleOpen(item)">
									<!-- Category icon -->
									<div class="row-icon" :class="styleFor(item.category).color">
										<Icon :name="styleFor(item.category).icon" class="w-4 h-4" />
									</div>

									<!-- Title + description -->
									<div class="flex-1 min-w-0">
										<div class="flex items-baseline gap-2">
											<p class="text-[13px] font-medium text-foreground truncate">{{ item.title }}</p>
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground/70 shrink-0 hidden md:inline">{{ categoryLabel(item.category) }}</span>
										</div>
										<p class="text-[11px] text-muted-foreground truncate mt-0.5">{{ item.description }}</p>
									</div>

									<!-- Right side: time + chevron -->
									<div class="row-meta">
										<span v-if="item.timestamp" class="text-[10px] tabular-nums text-muted-foreground/70 hidden sm:inline">
											{{ relativeTime(item.timestamp) }}
										</span>
										<span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors hidden md:inline">{{ item.actionLabel }}</span>
										<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
									</div>
								</button>
							</li>
						</ul>
					</section>
				</div>
			</div>
		</div>

		<!-- ─── Workspace panel (right side, lg+ only) ─── -->
		<aside class="hidden lg:flex flex-col w-80 shrink-0 border-l border-border/40 bg-muted/10 self-stretch sticky top-0 max-h-screen overflow-auto">
			<!-- Today's calendar -->
			<section class="px-5 pt-6 pb-5 border-b border-border/30">
				<div class="flex items-center justify-between mb-3">
					<h3 class="panel-label">Today</h3>
					<NuxtLink to="/scheduler" class="text-[10px] text-muted-foreground hover:text-foreground">View all</NuxtLink>
				</div>
				<div v-if="visibleTodayEvents.length === 0" class="text-[11px] text-muted-foreground py-2">
					Nothing scheduled.
				</div>
				<ul v-else class="space-y-2">
					<li v-for="evt in visibleTodayEvents" :key="evt.id" class="flex items-start gap-2.5">
						<div class="text-[10px] tabular-nums text-muted-foreground font-medium pt-0.5 w-12 shrink-0">{{ eventTime(evt.start_time) }}</div>
						<div class="flex-1 min-w-0">
							<p class="text-[12px] font-medium text-foreground truncate leading-snug">{{ evt.title }}</p>
							<p v-if="evt.contact?.name || evt.invitee_name" class="text-[10px] text-muted-foreground truncate">
								{{ evt.contact?.name || evt.invitee_name }}
							</p>
						</div>
						<Icon v-if="evt.is_video" name="lucide:video" class="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
					</li>
				</ul>
			</section>

			<!-- Timer -->
			<section class="px-5 py-5 border-b border-border/30">
				<div class="flex items-center justify-between mb-3">
					<h3 class="panel-label">Timer</h3>
					<button @click="openTimeTrackerModal" class="text-[10px] text-muted-foreground hover:text-foreground">Open</button>
				</div>
				<div v-if="isTimerRunning && activeTimer" class="rounded-lg bg-card border border-border/40 px-3 py-2.5">
					<div class="flex items-center justify-between">
						<div class="min-w-0">
							<p class="text-[11px] text-muted-foreground truncate">{{ activeTimer.description || 'Active timer' }}</p>
							<p class="text-[16px] font-semibold tabular-nums text-foreground mt-0.5">{{ formatElapsed(elapsed) }}</p>
						</div>
						<button
							v-if="!isTimerPaused"
							@click="pauseTimer"
							class="flex items-center justify-center w-8 h-8 rounded-full bg-muted/50 hover:bg-muted text-foreground"
						>
							<Icon name="lucide:pause" class="w-3.5 h-3.5" />
						</button>
						<button
							v-else
							@click="resumeTimer"
							class="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
						>
							<Icon name="lucide:play" class="w-3.5 h-3.5" />
						</button>
					</div>
				</div>
				<button
					v-else
					@click="openTimeTrackerModal"
					class="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border/60 hover:border-border hover:bg-muted/30 transition-colors text-[12px] text-muted-foreground"
				>
					<Icon name="lucide:play-circle" class="w-4 h-4" />
					Start a timer
				</button>
			</section>

			<!-- Score strip -->
			<section v-if="earnestState" class="px-5 py-4 border-b border-border/30">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="flex items-center gap-1.5">
							<Icon name="lucide:zap" class="w-3.5 h-3.5 text-amber-500" />
							<span class="text-[13px] font-semibold tabular-nums text-foreground">{{ earnestState.currentScore }}</span>
						</div>
						<div class="flex items-center gap-1.5">
							<Icon name="lucide:flame" class="w-3.5 h-3.5 text-orange-500" />
							<span class="text-[12px] tabular-nums text-foreground">{{ earnestState.streak }}d</span>
						</div>
					</div>
					<NuxtLink to="/account" class="text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-wider">
						Lv {{ earnestState.level }}
					</NuxtLink>
				</div>
			</section>

			<!-- Ask Earnest -->
			<section class="px-5 py-5 mt-auto">
				<h3 class="panel-label mb-2">Ask Earnest</h3>
				<form @submit.prevent="submitAsk" class="relative">
					<input
						v-model="askInput"
						type="text"
						placeholder="What should I focus on?"
						class="w-full pl-3 pr-9 py-2 rounded-lg border border-border/60 bg-card text-[12px] placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
					/>
					<button
						type="submit"
						class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-md text-primary hover:bg-primary/10"
					>
						<Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
					</button>
				</form>
			</section>
		</aside>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.group-label {
	@apply text-[10px] font-semibold uppercase tracking-wider text-foreground/80 flex items-center;
}

.panel-label {
	@apply text-[10px] font-semibold uppercase tracking-wider text-muted-foreground;
}

.inbox-row {
	@apply w-full flex items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-muted/30 cursor-pointer;
}

.row-icon {
	@apply flex items-center justify-center w-7 h-7 rounded-md bg-muted/30 shrink-0;
}

.row-meta {
	@apply flex items-center gap-3 shrink-0;
}
</style>
