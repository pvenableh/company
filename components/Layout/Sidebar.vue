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
				<span v-if="!collapsed" class="text-sm font-semibold text-foreground">Earnest</span>
			</NuxtLink>
		</div>

		<!-- Nav Links -->
		<div class="sidebar-nav">
			<!-- Primary (no label) -->
			<div v-if="primaryLinks.length" class="sidebar-section">
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
					<UIcon
						:name="link.icon"
						class="w-[18px] h-[18px] flex-shrink-0 transition-colors"
						:class="isActive(link.to) ? 'text-primary' : 'text-muted-foreground'"
					/>
					<span v-if="!collapsed" class="sidebar-link-label">{{ link.name }}</span>
				</NuxtLink>
			</div>

			<!-- Secondary (subtle divider) -->
			<div v-if="secondaryLinks.length" class="sidebar-section">
				<div v-if="!collapsed" class="sidebar-divider" />
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
					<UIcon
						:name="link.icon"
						class="w-[18px] h-[18px] flex-shrink-0 transition-colors"
						:class="isActive(link.to) ? 'text-primary' : 'text-muted-foreground'"
					/>
					<span v-if="!collapsed" class="sidebar-link-label">{{ link.name }}</span>
				</NuxtLink>
			</div>
		</div>

		<!-- Hat Picker -->
		<div class="px-2 pb-1">
			<LayoutHatPicker :collapsed="collapsed" />
		</div>

		<!-- Token Meter -->
		<OrganizationTokenMeter
			v-if="!collapsed && showTokenMeter"
			compact
			@topup="$router.push('/account/billing')"
		/>

		<!-- Footer -->
		<div class="sidebar-footer" :class="{ 'sidebar-footer--collapsed': collapsed }">
			<NuxtLink
				to="/organization"
				class="sidebar-link"
				:class="[
					isActive('/organization') ? 'sidebar-link-active' : 'sidebar-link-inactive',
					collapsed ? 'sidebar-link--collapsed' : '',
				]"
				:title="collapsed ? 'Organization' : undefined"
			>
				<UIcon name="i-heroicons-building-office-2" class="w-[18px] h-[18px] flex-shrink-0" :class="isActive('/organization') ? 'text-primary' : 'text-muted-foreground'" />
				<span v-if="!collapsed" class="sidebar-link-label">Organization</span>
			</NuxtLink>
			<NuxtLink
				to="/account#appearance"
				class="sidebar-link sidebar-link-inactive"
				:class="collapsed ? 'sidebar-link--collapsed' : ''"
				:title="collapsed ? 'Appearance' : undefined"
			>
				<UIcon name="i-heroicons-paint-brush" class="w-[18px] h-[18px] flex-shrink-0 text-muted-foreground" />
				<span v-if="!collapsed" class="sidebar-link-label">Appearance</span>
			</NuxtLink>
			<button
				class="sidebar-link sidebar-link-inactive"
				:class="collapsed ? 'sidebar-link--collapsed' : ''"
				:title="collapsed ? 'Edit Apps' : undefined"
				@click="$emit('edit-apps')"
			>
				<UIcon name="i-heroicons-pencil-square" class="w-[18px] h-[18px] flex-shrink-0 text-muted-foreground" />
				<span v-if="!collapsed" class="sidebar-link-label">Edit Apps</span>
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

const showTokenMeter = computed(() => {
	if (isDirectusAdmin.value) return true;
	if (isOrgAdminOrAbove.value) return true;
	const s = usageSummary.value;
	if (!s) return false;
	return s.orgLimit !== null && s.orgLimit !== undefined;
});

const primaryLinks = computed(() =>
	visibleLinks.value.filter(l => l.section === 'primary' && l.to !== '/'),
);

const secondaryLinks = computed(() =>
	visibleLinks.value.filter(l => l.section === 'secondary'),
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
	width: 220px;
	z-index: 30;
	flex-direction: column;
	border-right: 1px solid hsl(var(--border) / 0.4);
	background: hsl(var(--card) / 0.97);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	transition: width 0.2s ease;
}

.sidebar--collapsed {
	width: 56px;
}

.sidebar-collapse-row {
	display: flex;
	justify-content: flex-end;
	padding: 56px 10px 0;
}

.sidebar--collapsed .sidebar-collapse-row {
	justify-content: center;
	padding: 56px 6px 0;
}

.sidebar-header {
	position: relative;
	padding: 8px 14px 10px;
	border-bottom: 1px solid hsl(var(--border) / 0.25);
}

.sidebar--collapsed .sidebar-header {
	padding: 8px 6px 10px;
}

.sidebar-collapse-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 6px;
	color: hsl(var(--muted-foreground) / 0.5);
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
	padding: 6px 10px;
	scrollbar-width: none;
}
.sidebar-nav::-webkit-scrollbar {
	display: none;
}

.sidebar--collapsed .sidebar-nav {
	padding: 6px 4px;
}

.sidebar-section {
	margin-bottom: 4px;
}

.sidebar--collapsed .sidebar-section {
	margin-bottom: 2px;
}

.sidebar-divider {
	height: 1px;
	background: hsl(var(--border) / 0.3);
	margin: 6px 10px 8px;
}

.sidebar-link {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 10px;
	border-radius: 10px;
	font-size: 13px;
	font-weight: 500;
	transition: all 0.15s ease;
	cursor: pointer;
}

.sidebar-link--collapsed {
	justify-content: center;
	padding: 8px;
	gap: 0;
}

.sidebar-link-label {
	font-size: 13px;
	font-weight: 500;
	color: inherit;
}

.sidebar-link-active {
	background: hsl(var(--primary) / 0.08);
	color: hsl(var(--primary));
}

.sidebar-link-inactive {
	color: hsl(var(--muted-foreground));
}

.sidebar-link-inactive:hover {
	background: hsl(var(--muted) / 0.4);
	color: hsl(var(--foreground));
}

.sidebar-footer {
	padding: 10px;
	border-top: 1px solid hsl(var(--border) / 0.25);
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.sidebar-footer--collapsed {
	padding: 6px 4px;
}
</style>
