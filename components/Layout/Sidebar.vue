<template>
	<nav class="sidebar hidden xl:flex" v-if="user">
		<!-- Logo / Brand -->
		<div class="sidebar-header">
			<NuxtLink to="/" class="flex items-center gap-2.5 px-2 ios-press rounded-xl">
				<div class="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
					<UIcon name="i-heroicons-command-line" class="w-4 h-4 text-primary" />
				</div>
				<span class="text-sm font-semibold text-foreground">Command Center</span>
			</NuxtLink>
		</div>

		<!-- Nav Links -->
		<div class="sidebar-nav">
			<!-- Primary Section -->
			<div v-if="primaryLinks.length" class="sidebar-section">
				<span class="sidebar-section-label">Apps</span>
				<NuxtLink
					v-for="link in primaryLinks"
					:key="link.to"
					:to="link.to"
					class="sidebar-link"
					:class="isActive(link.to) ? 'sidebar-link-active' : 'sidebar-link-inactive'"
				>
					<UIcon :name="link.icon" class="w-5 h-5 flex-shrink-0" />
					<span>{{ link.name }}</span>
				</NuxtLink>
			</div>

			<!-- Secondary Section -->
			<div v-if="secondaryLinks.length" class="sidebar-section">
				<span class="sidebar-section-label">More</span>
				<NuxtLink
					v-for="link in secondaryLinks"
					:key="link.to"
					:to="link.to"
					class="sidebar-link"
					:class="isActive(link.to) ? 'sidebar-link-active' : 'sidebar-link-inactive'"
				>
					<UIcon :name="link.icon" class="w-5 h-5 flex-shrink-0" />
					<span>{{ link.name }}</span>
				</NuxtLink>
			</div>

			<!-- Tools Section -->
			<div v-if="toolLinks.length" class="sidebar-section">
				<span class="sidebar-section-label">Tools</span>
				<NuxtLink
					v-for="link in toolLinks"
					:key="link.to"
					:to="link.to"
					class="sidebar-link"
					:class="isActive(link.to) ? 'sidebar-link-active' : 'sidebar-link-inactive'"
				>
					<UIcon :name="link.icon" class="w-5 h-5 flex-shrink-0" />
					<span>{{ link.name }}</span>
				</NuxtLink>
			</div>
		</div>

		<!-- Bottom area -->
		<div class="sidebar-footer">
			<NuxtLink
				to="/organization"
				class="sidebar-link"
				:class="isActive('/organization') ? 'sidebar-link-active' : 'sidebar-link-inactive'"
			>
				<UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5 flex-shrink-0" />
				<span>Settings</span>
			</NuxtLink>
		</div>
	</nav>
</template>

<script setup lang="ts">
const { user } = useDirectusAuth();
const route = useRoute();
const { visibleLinks } = useNavPreferences();

// Filter links by section, excluding Command Center (shown as logo) and AI Chat (separate)
const primaryLinks = computed(() =>
	visibleLinks.value.filter(l => l.section === 'primary' && l.to !== '/'),
);

const secondaryLinks = computed(() =>
	visibleLinks.value.filter(l => l.section === 'secondary'),
);

const toolLinks = computed(() =>
	visibleLinks.value.filter(l => l.section === 'tools' && l.to !== '/organization'),
);

const isActive = (to: string) => {
	if (to === '/') return route.path === '/';
	return route.path.startsWith(to);
};
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.sidebar {
	position: fixed;
	top: 0;
	left: 0;
	bottom: 0;
	width: 240px;
	z-index: 30;
	flex-direction: column;
	border-right: 1px solid hsl(var(--border) / 0.5);
	background: hsl(var(--card) / 0.95);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
}

.sidebar-header {
	padding: 72px 16px 12px;
	border-bottom: 1px solid hsl(var(--border) / 0.3);
}

.sidebar-nav {
	flex: 1;
	overflow-y: auto;
	padding: 8px 12px;
	scrollbar-width: none;
}
.sidebar-nav::-webkit-scrollbar {
	display: none;
}

.sidebar-section {
	margin-bottom: 16px;
}

.sidebar-section-label {
	display: block;
	padding: 4px 12px 6px;
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: hsl(var(--muted-foreground) / 0.6);
}

.sidebar-link {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 12px;
	border-radius: 12px;
	font-size: 13px;
	font-weight: 500;
	transition: all 0.15s ease;
	cursor: pointer;
}

.sidebar-link-active {
	background: hsl(var(--primary) / 0.1);
	color: hsl(var(--primary));
}

.sidebar-link-inactive {
	color: hsl(var(--muted-foreground));
}

.sidebar-link-inactive:hover {
	background: hsl(var(--muted) / 0.5);
	color: hsl(var(--foreground));
}

.sidebar-footer {
	padding: 12px;
	border-top: 1px solid hsl(var(--border) / 0.3);
}
</style>
