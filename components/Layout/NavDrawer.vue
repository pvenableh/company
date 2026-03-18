<template>
	<!-- Backdrop -->
	<Transition name="sheet-backdrop">
		<div
			v-if="isOpen"
			class="sheet-backdrop"
			@click="closeSheet"
		/>
	</Transition>

	<!-- Bottom Sheet -->
	<Transition name="sheet">
		<div
			v-if="isOpen"
			ref="sheetRef"
			class="ios-sheet"
			@touchstart="onTouchStart"
			@touchmove="onTouchMove"
			@touchend="onTouchEnd"
			:style="{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined }"
		>
			<!-- Drag handle -->
			<div class="sheet-handle-area">
				<div class="sheet-handle" />
			</div>

			<!-- Sheet content -->
			<div class="sheet-content">
				<!-- AI Chat Callout -->
				<nuxt-link
					v-if="aiChatLink"
					:to="aiChatLink.to"
					class="ai-chat-callout"
					@click="handleAppClick($event)"
				>
					<div class="ai-chat-icon-wrap">
						<UIcon name="i-heroicons-sparkles" class="ai-chat-icon" />
					</div>
					<div class="ai-chat-text">
						<span class="ai-chat-title">Earnest AI</span>
						<span class="ai-chat-desc">Chat with your AI assistant</span>
					</div>
					<UIcon name="i-heroicons-chevron-right" class="ai-chat-arrow" />
				</nuxt-link>

				<!-- Primary Apps — AI-powered core -->
				<div v-if="primaryLinks.length" class="section-header">Apps</div>
				<div class="app-grid">
					<nuxt-link
						v-for="link in primaryLinks"
						:key="link.to"
						:to="link.to"
						class="app-item"
						@click="handleAppClick($event)"
					>
						<div class="app-icon-wrap">
							<div
								:class="[link.color, 'app-icon', { 'app-icon-active': route.path === link.to }]"
							>
								<UIcon :name="link.icon" class="icon-inner" />
							</div>
						</div>
						<span class="app-label" :class="{ 'app-label-active': route.path === link.to }">{{ link.name }}</span>
					</nuxt-link>
				</div>

				<!-- Secondary Apps -->
				<div v-if="secondaryLinks.length" class="section-header">More</div>
				<div class="app-grid">
					<nuxt-link
						v-for="link in secondaryLinks"
						:key="link.to"
						:to="link.to"
						class="app-item"
						@click="handleAppClick($event)"
					>
						<div class="app-icon-wrap">
							<div
								:class="[link.color, 'app-icon', { 'app-icon-active': route.path === link.to }]"
							>
								<UIcon :name="link.icon" class="icon-inner" />
							</div>
						</div>
						<span class="app-label" :class="{ 'app-label-active': route.path === link.to }">{{ link.name }}</span>
					</nuxt-link>
				</div>

				<!-- Tools -->
				<div v-if="toolLinks.length" class="section-header">Tools</div>
				<div class="tools-grid">
					<nuxt-link
						v-for="link in toolLinks"
						:key="link.to"
						:to="link.to"
						class="tool-item"
						@click="handleAppClick($event)"
					>
						<UIcon :name="link.icon" class="tool-icon" />
						<span class="tool-label">{{ link.name }}</span>
					</nuxt-link>
				</div>

				<!-- Divider -->
				<div class="sheet-divider" />

				<!-- Bottom bar — pill buttons matching TeamSelect / ClientSelect UX -->
				<div class="bottom-bar">
					<!-- Left: Account avatar pill + auth pill -->
					<div class="bar-group">
						<nuxt-link v-if="user" to="/account" class="pill-btn" @click="handleAppClick($event)">
							<div class="pill-avatar">
								<img v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" class="pill-avatar-img" />
								<span v-else class="pill-avatar-initials">{{ initials }}</span>
							</div>
							<span class="pill-text">Account</span>
						</nuxt-link>
						<template v-if="user">
							<button class="pill-btn pill-destructive" @click="handleLogout">
								<UIcon name="i-heroicons-arrow-right-start-on-rectangle" class="pill-icon" />
								<span class="pill-text">Sign Out</span>
							</button>
						</template>
						<nuxt-link v-else to="/auth/signin" class="pill-btn" @click="handleAppClick($event)">
							<UIcon name="i-heroicons-arrow-right-end-on-rectangle" class="pill-icon" />
							<span class="pill-text">Sign In</span>
						</nuxt-link>
					</div>

					<!-- Right: Dark mode + Edit pill -->
					<div class="bar-group">
						<ClientOnly>
							<button class="pill-btn pill-icon-only" @click="toggleDark" :aria-label="isDark ? 'Light mode' : 'Dark mode'">
								<UIcon :name="isDark ? 'i-heroicons-moon' : 'i-heroicons-sun'" class="pill-icon" />
							</button>
						</ClientOnly>
						<button class="pill-btn" @click="handleEditApps">
							<UIcon name="i-heroicons-pencil-square" class="pill-icon" />
							<span class="pill-text">Edit</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'vue-sonner';

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const { logout } = useLogout();
const { triggerHaptic } = useHaptic();
const { visibleLinks } = useNavPreferences();
import { sheetOpen, closeSheet as closeSheetState } from '~~/composables/useScreen';

// Use composable directly for reactivity — props through NuxtLayout don't propagate changes
const links = computed(() => visibleLinks.value.filter((l) => l.type.includes('drawer')));

// Grouped links for sectioned drawer
const primaryLinks = computed(() => links.value.filter((l) => l.section === 'primary'));
const secondaryLinks = computed(() => links.value.filter((l) => l.section === 'secondary'));
const toolLinks = computed(() => links.value.filter((l) => l.section === 'tools'));
const aiChatLink = computed(() => visibleLinks.value.find((l) => l.to === '/command-center/ai'));

const emit = defineEmits(['edit-apps']);

const sheetRef = ref(null);
const dragOffset = ref(0);
let startY = 0;
let isDragging = false;

const isOpen = sheetOpen;

// Avatar
const avatarUrl = computed(() => {
	if (!user.value?.avatar) return null;
	return `${config.public.assetsUrl}${user.value.avatar}?key=avatar`;
});

const initials = computed(() => {
	if (!user.value) return 'U';
	const first = user.value.first_name?.[0] ?? '';
	const last = user.value.last_name?.[0] ?? '';
	return (first + last).toUpperCase() || 'U';
});

// Dark mode
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');
function toggleDark() {
	colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

function closeSheet() {
	closeSheetState();
	dragOffset.value = 0;
}

function handleAppClick(e) {
	if (!user.value) {
		e.preventDefault();
		closeSheet();
		toast.warning('You need to be logged in with an active account for this feature.');
		router.push({ path: '/register', query: { redirect: route.fullPath } });
		return;
	}
	closeSheet();
}

function handleLogout() {
	closeSheet();
	logout();
}

function handleEditApps() {
	triggerHaptic(10);
	closeSheet();
	emit('edit-apps');
}

function onTouchStart(e) {
	startY = e.touches[0].clientY;
	isDragging = true;
}

function onTouchMove(e) {
	if (!isDragging) return;
	const diff = e.touches[0].clientY - startY;
	if (diff > 0) {
		dragOffset.value = diff;
	}
}

function onTouchEnd() {
	isDragging = false;
	if (dragOffset.value > 120) {
		triggerHaptic(10);
		closeSheet();
	} else {
		dragOffset.value = 0;
	}
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Backdrop */
.sheet-backdrop {
	position: fixed;
	inset: 0;
	z-index: 50;
	background: rgba(0, 0, 0, 0.3);
	-webkit-tap-highlight-color: transparent;
}

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
	transition: opacity 0.3s ease;
}
.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
	opacity: 0;
}

/* Bottom Sheet */
.ios-sheet {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 51;
	max-height: 85vh;
	border-radius: 14px 14px 0 0;
	padding-bottom: env(safe-area-inset-bottom, 0px);
	overflow-y: auto;
	overscroll-behavior: contain;
	-webkit-overflow-scrolling: touch;
	transition: transform 0.15s ease;
	background: hsl(var(--card));
}

.sheet-enter-active {
	transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.sheet-leave-active {
	transition: transform 0.3s cubic-bezier(0.4, 0, 1, 1);
}
.sheet-enter-from,
.sheet-leave-to {
	transform: translateY(100%) !important;
}

/* Drag handle */
.sheet-handle-area {
	display: flex;
	justify-content: center;
	padding: 8px 0 4px;
	cursor: grab;
}

.sheet-handle {
	width: 36px;
	height: 5px;
	border-radius: 3px;
	background: hsl(var(--muted-foreground) / 0.3);
}

.sheet-content {
	padding: 0 0 6px;
}

/* ── AI Chat Callout ── */
.ai-chat-callout {
	display: flex;
	align-items: center;
	gap: 10px;
	margin: 4px 10px 6px;
	padding: 10px 12px;
	border-radius: 14px;
	background: linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.15));
	border: 1px solid hsl(var(--primary) / 0.2);
	text-decoration: none;
	-webkit-tap-highlight-color: transparent;
	transition: transform 0.15s ease, background 0.2s;
}

.ai-chat-callout:active {
	transform: scale(0.98);
}

.ai-chat-icon-wrap {
	width: 36px;
	height: 36px;
	border-radius: 10px;
	background: hsl(var(--primary));
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.ai-chat-icon {
	width: 18px;
	height: 18px;
	color: hsl(var(--primary-foreground));
}

.ai-chat-text {
	display: flex;
	flex-direction: column;
	gap: 1px;
	flex: 1;
	min-width: 0;
}

.ai-chat-title {
	font-size: 13px;
	font-weight: 600;
	color: hsl(var(--foreground));
}

.ai-chat-desc {
	font-size: 10px;
	color: hsl(var(--muted-foreground));
}

.ai-chat-arrow {
	width: 14px;
	height: 14px;
	color: hsl(var(--muted-foreground));
	flex-shrink: 0;
}

/* ── Section Headers ── */
.section-header {
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	color: hsl(var(--muted-foreground));
	padding: 6px 14px 2px;
}

/* ── App Grid — iPhone home screen ── */
.app-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 2px 0;
	padding: 4px 8px 10px;
}

@media (min-width: 640px) {
	.app-grid {
		grid-template-columns: repeat(5, 1fr);
		gap: 6px 0;
		padding: 6px 12px 14px;
	}
}

.app-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 3px;
	padding: 5px 2px;
	border-radius: 14px;
	text-decoration: none;
	-webkit-tap-highlight-color: transparent;
	transition: transform 0.15s ease;
}

@media (min-width: 640px) {
	.app-item {
		gap: 5px;
		padding: 6px 4px;
	}
}

.app-item:active {
	transform: scale(0.9);
}

.app-icon-wrap {
	position: relative;
}

.app-icon {
	width: 44px;
	height: 44px;
	border-radius: 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: box-shadow 0.2s ease, transform 0.2s ease;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
}

@media (min-width: 640px) {
	.app-icon {
		width: 52px;
		height: 52px;
		border-radius: 14px;
	}
}

.icon-inner {
	width: 20px;
	height: 20px;
	color: white;
}

@media (min-width: 640px) {
	.icon-inner {
		width: 24px;
		height: 24px;
	}
}

.app-icon-active {
	box-shadow: 0 0 0 2.5px hsl(var(--primary)), 0 2px 8px rgba(0, 0, 0, 0.15);
}

.app-label {
	font-size: 9px;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: hsl(var(--foreground) / 0.7);
	text-align: center;
	line-height: 1.1;
	max-width: 72px;
	overflow: hidden;
	text-overflow: ellipsis;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	white-space: normal;
	word-break: break-word;
}

@media (min-width: 640px) {
	.app-label {
		font-size: 10px;
		line-height: 1.15;
		max-width: 80px;
	}
}

.app-label-active {
	color: hsl(var(--primary));
	font-weight: 600;
}

/* ── Tools Grid — compact pill style ── */
.tools-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding: 4px 10px 10px;
}

.tool-item {
	display: flex;
	align-items: center;
	gap: 5px;
	padding: 6px 10px;
	border-radius: 10px;
	background: hsl(var(--muted) / 0.5);
	border: 1px solid hsl(var(--border) / 0.5);
	text-decoration: none;
	-webkit-tap-highlight-color: transparent;
	transition: transform 0.15s ease, background 0.2s;
}

.tool-item:active {
	transform: scale(0.95);
	background: hsl(var(--muted));
}

.tool-icon {
	width: 14px;
	height: 14px;
	color: hsl(var(--muted-foreground));
}

.tool-label {
	font-size: 10px;
	font-weight: 500;
	color: hsl(var(--foreground) / 0.8);
	white-space: nowrap;
}

/* ── Divider ── */
.sheet-divider {
	height: 0.5px;
	margin: 0 12px;
	background: hsl(var(--border) / 0.5);
}

/* ── Bottom bar — pill buttons ── */
.bottom-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 10px 4px;
	gap: 6px;
}

.bar-group {
	display: flex;
	align-items: center;
	gap: 4px;
}

/* Pill button — matches TeamSelect / ClientSelect pattern */
.pill-btn {
	display: flex;
	align-items: center;
	gap: 3px;
	padding: 4px 8px;
	border-radius: 9999px;
	background: hsl(var(--background));
	border: 1px solid hsl(var(--border));
	font-size: 9px;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: hsl(var(--foreground) / 0.7);
	white-space: nowrap;
	cursor: pointer;
	transition: border-color 0.2s ease, color 0.2s ease;
	-webkit-tap-highlight-color: transparent;
	text-decoration: none;
	flex-shrink: 0;
}

.pill-btn:hover,
.pill-btn:active {
	border-color: hsl(var(--primary));
	color: hsl(var(--foreground));
}

.pill-destructive {
	color: hsl(var(--destructive));
}
.pill-destructive:hover,
.pill-destructive:active {
	border-color: hsl(var(--destructive));
	color: hsl(var(--destructive));
}

.pill-icon-only {
	padding: 4px 6px;
}

.pill-icon {
	width: 12px;
	height: 12px;
	flex-shrink: 0;
}

.pill-text {
	line-height: 1;
}

/* Avatar inside pill */
.pill-avatar {
	width: 16px;
	height: 16px;
	border-radius: 9999px;
	background: hsl(var(--muted));
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	flex-shrink: 0;
}

.pill-avatar-img {
	width: 16px;
	height: 16px;
	object-fit: cover;
	border-radius: 9999px;
}

.pill-avatar-initials {
	font-size: 7px;
	font-weight: 600;
	color: hsl(var(--foreground) / 0.6);
}
</style>
