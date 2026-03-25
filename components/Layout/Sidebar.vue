<template>
	<nav class="sidebar hidden xl:flex" :class="{ 'sidebar--collapsed': collapsed }" v-if="user">
		<!-- Collapse / Expand -->
		<div class="sidebar-collapse-row">
			<button
				class="sidebar-collapse-btn"
				:title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
				@click="toggle"
			>
				<UIcon :name="collapsed ? 'i-heroicons-chevron-right' : 'i-heroicons-chevron-left'" class="w-3.5 h-3.5" />
			</button>
		</div>

		<!-- Logo / Brand -->
		<div class="sidebar-header">
			<NuxtLink to="/" class="flex items-center gap-2.5 px-2 ios-press rounded-xl" :class="{ 'justify-center px-0': collapsed }">
				<div class="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
					<UIcon name="i-heroicons-command-line" class="w-4 h-4 text-primary" />
				</div>
				<span v-if="!collapsed" class="text-[11px] font-semibold text-foreground uppercase tracking-wider">Command Center</span>
			</NuxtLink>
		</div>

		<!-- Nav Links -->
		<div class="sidebar-nav">
			<!-- Primary Section -->
			<div v-if="primaryLinks.length" class="sidebar-section">
				<span v-if="!collapsed" class="sidebar-section-label">Apps</span>
				<NuxtLink
					v-for="link in primaryLinks"
					:key="link.to"
					:to="link.to"
					class="sidebar-link"
					:class="[
						isActive(link.to) ? 'sidebar-link-active' : 'sidebar-link-inactive',
						collapsed ? 'sidebar-link--collapsed' : '',
					]"
					:title="collapsed ? link.name : undefined"
				>
					<div
						class="sidebar-icon-box flex-shrink-0"
						:class="[link.color || 'bg-gray-500', isActive(link.to) ? 'ring-2 ring-primary/30' : '']"
					>
						<UIcon :name="link.icon" class="w-3.5 h-3.5 text-white" />
					</div>
					<span v-if="!collapsed" class="sidebar-link-label">{{ link.name }}</span>
				</NuxtLink>
			</div>

			<!-- Secondary Section -->
			<div v-if="secondaryLinks.length" class="sidebar-section">
				<span v-if="!collapsed" class="sidebar-section-label">More</span>
				<NuxtLink
					v-for="link in secondaryLinks"
					:key="link.to"
					:to="link.to"
					class="sidebar-link"
					:class="[
						isActive(link.to) ? 'sidebar-link-active' : 'sidebar-link-inactive',
						collapsed ? 'sidebar-link--collapsed' : '',
					]"
					:title="collapsed ? link.name : undefined"
				>
					<div
						class="sidebar-icon-box flex-shrink-0"
						:class="[link.color || 'bg-gray-500', isActive(link.to) ? 'ring-2 ring-primary/30' : '']"
					>
						<UIcon :name="link.icon" class="w-3.5 h-3.5 text-white" />
					</div>
					<span v-if="!collapsed" class="sidebar-link-label">{{ link.name }}</span>
				</NuxtLink>
			</div>

			<!-- Tools Section -->
			<div v-if="toolLinks.length" class="sidebar-section">
				<span v-if="!collapsed" class="sidebar-section-label">Tools</span>
				<NuxtLink
					v-for="link in toolLinks"
					:key="link.to"
					:to="link.to"
					class="sidebar-link"
					:class="[
						isActive(link.to) ? 'sidebar-link-active' : 'sidebar-link-inactive',
						collapsed ? 'sidebar-link--collapsed' : '',
					]"
					:title="collapsed ? link.name : undefined"
				>
					<div
						class="sidebar-icon-box flex-shrink-0"
						:class="[link.color || 'bg-gray-500', isActive(link.to) ? 'ring-2 ring-primary/30' : '']"
					>
						<UIcon :name="link.icon" class="w-3.5 h-3.5 text-white" />
					</div>
					<span v-if="!collapsed" class="sidebar-link-label">{{ link.name }}</span>
				</NuxtLink>
			</div>
		</div>

		<!-- Token Meter — shows when org has a tracked limit OR admin is in "view as" mode -->
		<OrganizationTokenMeter
			v-if="!collapsed && showTokenMeter"
			compact
			@topup="$router.push('/account/billing')"
		/>

		<!-- Bottom area -->
		<div class="sidebar-footer" :class="{ 'sidebar-footer--collapsed': collapsed }">
			<NuxtLink
				to="/organization"
				class="sidebar-link"
				:class="[
					isActive('/organization') ? 'sidebar-link-active' : 'sidebar-link-inactive',
					collapsed ? 'sidebar-link--collapsed' : '',
				]"
				:title="collapsed ? 'Settings' : undefined"
			>
				<UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5 flex-shrink-0" />
				<span v-if="!collapsed">Settings</span>
			</NuxtLink>
			<button
				class="sidebar-link sidebar-link-inactive"
				:class="collapsed ? 'sidebar-link--collapsed' : ''"
				:title="collapsed ? 'Edit Apps' : undefined"
				@click="$emit('edit-apps')"
			>
				<UIcon name="i-heroicons-pencil-square" class="w-5 h-5 flex-shrink-0" />
				<span v-if="!collapsed">Edit Apps</span>
			</button>
		</div>
	</nav>
</template>

<script setup lang="ts">
defineEmits(['edit-apps']);

const { user } = useDirectusAuth();
const route = useRoute();
const { visibleLinks } = useNavPreferences();
const { collapsed, toggle } = useSidebarCollapsed();
const { usageSummary } = useAITokens();
const { isOrgAdminOrAbove } = useOrgRole();
const { isDirectusAdmin } = useViewAsOrgAdmin();

// Show token meter:
// - Directus admins: always (they admin every org)
// - Org admins/owners: always (they manage their org's usage)
// - Regular members: only when the org has an explicit token limit set
const showTokenMeter = computed(() => {
	if (isDirectusAdmin.value) return true;
	if (isOrgAdminOrAbove.value) return true;
	const s = usageSummary.value;
	if (!s) return false;
	return s.orgLimit !== null && s.orgLimit !== undefined;
});

// Filter links by section, excluding Command Center (shown as logo) and AI Chat (separate)
const primaryLinks = computed(() =>
	visibleLinks.value.filter(l => l.section === 'primary' && l.to !== '/'),
);

const secondaryLinks = computed(() =>
	visibleLinks.value.filter(l => l.section === 'secondary'),
);

const toolLinks = computed(() =>
	visibleLinks.value.filter(l => l.section === 'tools'),
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
	transition: width 0.2s ease;
}

.sidebar--collapsed {
	width: 64px;
}

.sidebar-collapse-row {
	display: flex;
	justify-content: flex-end;
	padding: 64px 12px 0;
}

.sidebar--collapsed .sidebar-collapse-row {
	justify-content: center;
	padding: 64px 8px 0;
}

.sidebar-header {
	position: relative;
	padding: 8px 16px 12px;
	border-bottom: 1px solid hsl(var(--border) / 0.3);
}

.sidebar--collapsed .sidebar-header {
	padding: 8px 8px 12px;
}

.sidebar-collapse-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 6px;
	color: hsl(var(--muted-foreground) / 0.6);
	transition: all 0.15s ease;
	cursor: pointer;
}
.sidebar-collapse-btn:hover {
	background: hsl(var(--muted) / 0.5);
	color: hsl(var(--foreground));
}

.sidebar--collapsed .sidebar-collapse-btn {
	margin: 0 auto;
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

.sidebar--collapsed .sidebar-nav {
	padding: 8px 6px;
}

.sidebar-section {
	margin-bottom: 16px;
}

.sidebar--collapsed .sidebar-section {
	margin-bottom: 8px;
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

.sidebar-link--collapsed {
	justify-content: center;
	padding: 10px 10px;
	gap: 0;
}

.sidebar-icon-box {
	width: 28px;
	height: 28px;
	border-radius: 8px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.15s ease;
}

.sidebar-link-label {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
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
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.sidebar-footer--collapsed {
	padding: 8px 6px;
}
</style>
