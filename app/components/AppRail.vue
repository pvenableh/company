<script setup lang="ts">
/**
 * AppRail — top-level navigation rail for Apps Layout mode.
 *
 * Design (Phase 7 polish):
 *   - 4 work apps in the vertical center: Clients / Work / Money / Marketing
 *   - Footer pair below a divider: Organization (admin app) + Account
 *   - Each item gets a per-app accent color so the rail reads as
 *     branded surface, not a plain icon strip
 *   - Active item: filled rounded-square chip in the accent color;
 *     inactive items use a muted icon with a subtle hover lift
 *
 * Position respects `useAppsMode().railPosition`:
 *   left / right → vertical column with footer pinned to bottom
 *   top / bottom → horizontal strip, footer wraps to the right
 *   floating     → glass + shadow pill, bottom-center
 *
 * Mobile (< md) forces bottom via useAppsMode.
 */

interface RailItem {
	id: string;
	name: string;
	icon: string;
	to: string;
	tone: 'orange' | 'violet' | 'emerald' | 'sky' | 'slate' | 'zinc';
}

const APPS: RailItem[] = [
	{ id: 'clients', name: 'Clients', icon: 'lucide:users-round', to: '/apps/clients', tone: 'orange' },
	{ id: 'work', name: 'Work', icon: 'lucide:briefcase-business', to: '/apps/work', tone: 'violet' },
	{ id: 'money', name: 'Money', icon: 'lucide:wallet-cards', to: '/apps/money', tone: 'emerald' },
	{ id: 'marketing', name: 'Marketing', icon: 'lucide:megaphone', to: '/apps/marketing', tone: 'sky' },
];

const FOOTER: RailItem[] = [
	{ id: 'organization', name: 'Organization', icon: 'lucide:building-2', to: '/apps/organization', tone: 'slate' },
	{ id: 'account', name: 'Account', icon: 'lucide:user-round-cog', to: '/account', tone: 'zinc' },
];

const route = useRoute();
const { railPosition } = useAppsMode();

const activeId = computed(() => {
	const path = route.path;
	if (path.startsWith('/account')) return 'account';
	const seg = path.split('/').filter(Boolean);
	if (seg[0] !== 'apps') return null;
	return [...APPS, ...FOOTER].find((a) => a.id === seg[1])?.id ?? null;
});

const isHorizontal = computed(() =>
	railPosition.value === 'top'
	|| railPosition.value === 'bottom'
	|| railPosition.value === 'floating',
);
</script>

<template>
	<nav
		class="app-rail"
		:class="[
			`app-rail--${railPosition}`,
			isHorizontal ? 'app-rail--horizontal' : 'app-rail--vertical',
		]"
		aria-label="Apps"
	>
		<ul class="app-rail__group app-rail__group--main">
			<li v-for="app in APPS" :key="app.id">
				<NuxtLink
					:to="app.to"
					class="app-rail__item"
					:class="[
						`app-rail__item--${app.tone}`,
						{ 'app-rail__item--active': activeId === app.id },
					]"
				>
					<span class="app-rail__chip">
						<Icon :name="app.icon" class="app-rail__icon" />
					</span>
					<span class="app-rail__label">{{ app.name }}</span>
				</NuxtLink>
			</li>
		</ul>

		<span class="app-rail__divider" aria-hidden="true" />

		<ul class="app-rail__group app-rail__group--footer">
			<li v-for="app in FOOTER" :key="app.id">
				<NuxtLink
					:to="app.to"
					class="app-rail__item"
					:class="[
						`app-rail__item--${app.tone}`,
						{ 'app-rail__item--active': activeId === app.id },
					]"
				>
					<span class="app-rail__chip">
						<Icon :name="app.icon" class="app-rail__icon" />
					</span>
					<span class="app-rail__label">{{ app.name }}</span>
				</NuxtLink>
			</li>
		</ul>
	</nav>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-rail {
	@apply flex bg-background border-border/40 select-none;
	--rail-gap: 14px;
}

/* ── Layout ──────────────────────────────────────────────────────── */
.app-rail--vertical {
	@apply flex-col w-[78px] shrink-0 py-3;
	row-gap: var(--rail-gap);
	justify-content: center;
}

.app-rail--horizontal {
	@apply flex-row w-full px-3 py-1.5 overflow-x-auto justify-center items-center;
	column-gap: var(--rail-gap);
}

.app-rail--left { @apply border-r; }
.app-rail--right { @apply border-l; }
.app-rail--top { @apply border-b; }
.app-rail--bottom { @apply border-t pb-[env(safe-area-inset-bottom)]; }

.app-rail--floating {
	@apply fixed left-1/2 -translate-x-1/2 z-40
		flex-row items-center
		rounded-full border border-border/40 shadow-2xl
		bg-background/85 backdrop-blur-md
		px-2 py-1.5 w-auto;
	bottom: calc(1rem + env(safe-area-inset-bottom));
	column-gap: 6px;
}

/* ── Groups ──────────────────────────────────────────────────────── */
.app-rail__group {
	@apply flex list-none m-0 p-0;
}

.app-rail--vertical .app-rail__group {
	@apply flex-col items-stretch w-full;
	row-gap: 6px;
}

.app-rail--horizontal .app-rail__group {
	@apply flex-row items-center;
	column-gap: 4px;
}

.app-rail--vertical .app-rail__group--main {
	@apply px-2;
}

.app-rail--vertical .app-rail__group--footer {
	@apply px-2;
}

.app-rail__divider {
	@apply bg-border/40 self-center shrink-0;
}

.app-rail--vertical .app-rail__divider {
	@apply h-px w-8 my-1;
}

.app-rail--horizontal .app-rail__divider {
	@apply w-px h-6 mx-1;
}

.app-rail--floating .app-rail__divider {
	display: none;
}

/* ── Item ─────────────────────────────────────────────────────────── */
.app-rail__item {
	@apply flex flex-col items-center justify-center gap-1
		rounded-lg
		text-muted-foreground
		transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]
		no-underline;
	padding: 6px 4px;
}

.app-rail__item:hover {
	@apply text-foreground bg-muted/40;
}

.app-rail--horizontal .app-rail__item,
.app-rail--floating .app-rail__item {
	@apply flex-row gap-2;
	padding: 4px 10px;
}

/* ── Chip (icon container) ───────────────────────────────────────── */
.app-rail__chip {
	@apply flex items-center justify-center shrink-0
		rounded-xl
		transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)];
	width: 36px;
	height: 36px;
	background: hsl(var(--muted) / 0.55);
}

.app-rail--horizontal .app-rail__chip,
.app-rail--floating .app-rail__chip {
	width: 28px;
	height: 28px;
	@apply rounded-lg;
}

.app-rail__icon {
	@apply size-[18px];
	stroke-width: 1.75;
	transition: color 0.2s ease, transform 0.2s ease;
}

.app-rail--horizontal .app-rail__icon,
.app-rail--floating .app-rail__icon {
	@apply size-4;
}

/* Tone tints — soft fill for inactive icons, deeper for active state */
.app-rail__item--orange .app-rail__icon  { color: hsl(24 90% 50%); }
.app-rail__item--violet .app-rail__icon  { color: hsl(258 75% 60%); }
.app-rail__item--emerald .app-rail__icon { color: hsl(160 70% 40%); }
.app-rail__item--sky .app-rail__icon     { color: hsl(200 85% 45%); }
.app-rail__item--slate .app-rail__icon   { color: hsl(215 20% 45%); }
.app-rail__item--zinc .app-rail__icon    { color: hsl(220 10% 45%); }

.app-rail__item:hover .app-rail__chip {
	transform: translateY(-1px);
	background: hsl(var(--muted) / 0.85);
}

/* ── Active state ────────────────────────────────────────────────── */
.app-rail__item--active {
	@apply text-foreground;
}

.app-rail__item--active .app-rail__chip {
	@apply shadow-sm;
	transform: none;
}

.app-rail__item--active.app-rail__item--orange .app-rail__chip  {
	background: linear-gradient(135deg, hsl(20 90% 60%), hsl(15 85% 50%));
}
.app-rail__item--active.app-rail__item--violet .app-rail__chip  {
	background: linear-gradient(135deg, hsl(258 80% 65%), hsl(270 70% 55%));
}
.app-rail__item--active.app-rail__item--emerald .app-rail__chip {
	background: linear-gradient(135deg, hsl(160 65% 45%), hsl(170 60% 38%));
}
.app-rail__item--active.app-rail__item--sky .app-rail__chip     {
	background: linear-gradient(135deg, hsl(200 85% 55%), hsl(210 75% 48%));
}
.app-rail__item--active.app-rail__item--slate .app-rail__chip   {
	background: linear-gradient(135deg, hsl(215 25% 55%), hsl(220 25% 42%));
}
.app-rail__item--active.app-rail__item--zinc .app-rail__chip    {
	background: linear-gradient(135deg, hsl(220 12% 55%), hsl(220 10% 42%));
}

.app-rail__item--active .app-rail__icon {
	color: white;
}

/* ── Label ───────────────────────────────────────────────────────── */
.app-rail__label {
	font-size: 10px;
	font-weight: 500;
	letter-spacing: 0.04em;
	line-height: 1;
	text-transform: uppercase;
	color: hsl(var(--muted-foreground));
	transition: color 0.2s ease;
}

.app-rail__item:hover .app-rail__label {
	color: hsl(var(--foreground));
}

.app-rail__item--active .app-rail__label {
	color: hsl(var(--foreground));
	font-weight: 600;
}

.app-rail--horizontal .app-rail__label,
.app-rail--floating .app-rail__label {
	font-size: 11px;
	letter-spacing: 0.02em;
	text-transform: none;
}
</style>
