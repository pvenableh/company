<script setup lang="ts">
const router = useRouter()
const { user } = useDirectusAuth()

const { suggestions, isAnalyzing, analyze } = useAIProductivityEngine()
const { enabledModules } = useAIPreferences()
const { selectedOrg } = useOrganization()

onMounted(() => {
	if (user.value) analyze(new Set(enabledModules.value))
})
watch([selectedOrg, user], () => {
	if (user.value) analyze(new Set(enabledModules.value))
})

// ── Group items into Now / Today / Up Next ──
const nowItems = computed(() => suggestions.value.filter((s) => s.priority === 'urgent'))
const todayItems = computed(() => suggestions.value.filter((s) => s.priority === 'high'))
const upNextItems = computed(() => suggestions.value.filter((s) => s.priority === 'medium' || s.priority === 'low'))

const totalCount = computed(() => suggestions.value.length)

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

// ── Category icon colors ──
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

function handleOpen(item: { actionRoute?: string; actionFn?: () => void }) {
	if (item.actionRoute) {
		router.push(item.actionRoute)
	} else if (item.actionFn) {
		item.actionFn()
	}
}
</script>

<template>
	<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-20">
		<!-- ── Header ── -->
		<div class="flex items-end justify-between mb-8">
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

		<!-- ── Loading state ── -->
		<div v-if="isAnalyzing && suggestions.length === 0" class="space-y-3">
			<div v-for="i in 4" :key="i" class="h-14 rounded-xl bg-muted/30 animate-pulse" />
		</div>

		<!-- ── Empty state ── -->
		<div v-else-if="totalCount === 0" class="rounded-2xl border border-border/40 bg-muted/10 px-6 py-12 text-center">
			<Icon name="lucide:inbox" class="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" />
			<p class="text-[14px] font-medium text-foreground">All clear</p>
			<p class="text-[12px] text-muted-foreground mt-1">No urgent items. Take a breath.</p>
		</div>

		<!-- ── Smart groups ── -->
		<div v-else class="space-y-8">
			<!-- Now -->
			<section v-if="nowItems.length > 0">
				<h2 class="group-label">
					<span class="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-2 align-middle" />
					Now
					<span class="text-muted-foreground/60 font-normal ml-1.5">{{ nowItems.length }}</span>
				</h2>
				<ul class="mt-2.5 space-y-1">
					<li v-for="item in nowItems" :key="item.id">
						<button
							class="inbox-row group"
							@click="handleOpen(item)"
						>
							<div class="row-icon" :class="styleFor(item.category).color">
								<Icon :name="styleFor(item.category).icon" class="w-4 h-4" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-[13px] font-medium text-foreground truncate">{{ item.title }}</p>
								<p class="text-[11px] text-muted-foreground truncate">{{ item.description }}</p>
							</div>
							<div class="row-action">
								<span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">{{ item.actionLabel }}</span>
								<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
							</div>
						</button>
					</li>
				</ul>
			</section>

			<!-- Today -->
			<section v-if="todayItems.length > 0">
				<h2 class="group-label">
					<span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 align-middle" />
					Today
					<span class="text-muted-foreground/60 font-normal ml-1.5">{{ todayItems.length }}</span>
				</h2>
				<ul class="mt-2.5 space-y-1">
					<li v-for="item in todayItems" :key="item.id">
						<button
							class="inbox-row group"
							@click="handleOpen(item)"
						>
							<div class="row-icon" :class="styleFor(item.category).color">
								<Icon :name="styleFor(item.category).icon" class="w-4 h-4" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-[13px] font-medium text-foreground truncate">{{ item.title }}</p>
								<p class="text-[11px] text-muted-foreground truncate">{{ item.description }}</p>
							</div>
							<div class="row-action">
								<span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">{{ item.actionLabel }}</span>
								<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
							</div>
						</button>
					</li>
				</ul>
			</section>

			<!-- Up Next -->
			<section v-if="upNextItems.length > 0">
				<h2 class="group-label">
					<span class="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mr-2 align-middle" />
					Up Next
					<span class="text-muted-foreground/60 font-normal ml-1.5">{{ upNextItems.length }}</span>
				</h2>
				<ul class="mt-2.5 space-y-1">
					<li v-for="item in upNextItems" :key="item.id">
						<button
							class="inbox-row group"
							@click="handleOpen(item)"
						>
							<div class="row-icon" :class="styleFor(item.category).color">
								<Icon :name="styleFor(item.category).icon" class="w-4 h-4" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-[13px] font-medium text-foreground truncate">{{ item.title }}</p>
								<p class="text-[11px] text-muted-foreground truncate">{{ item.description }}</p>
							</div>
							<div class="row-action">
								<span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">{{ item.actionLabel }}</span>
								<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
							</div>
						</button>
					</li>
				</ul>
			</section>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.group-label {
	@apply text-[10px] font-semibold uppercase tracking-wider text-foreground/80 flex items-center;
}

.inbox-row {
	@apply w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-muted/40 cursor-pointer;
}

.row-icon {
	@apply flex items-center justify-center w-7 h-7 rounded-lg bg-muted/30 shrink-0;
}

.row-action {
	@apply flex items-center gap-1 shrink-0;
}
</style>
