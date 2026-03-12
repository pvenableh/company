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
				<!-- Navigation links -->
				<div class="ios-group mx-4 mb-4">
					<nuxt-link
						v-for="(link, index) in links"
						:key="index"
						:to="link.to"
						class="sheet-row"
						:class="{ 'sheet-row-active': route.path === link.to }"
						@click="closeSheet"
					>
						<UIcon :name="link.icon" class="w-5 h-5" />
						<span class="flex-1">{{ link.name }}</span>
						<UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-muted-foreground/40" />
					</nuxt-link>
				</div>

				<!-- Account section -->
				<div class="ios-group mx-4 mb-4">
					<nuxt-link
						v-if="user"
						to="/organization"
						class="sheet-row"
						@click="closeSheet"
					>
						<UIcon name="i-heroicons-building-office-2" class="w-5 h-5" />
						<span class="flex-1">Organization</span>
						<UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-muted-foreground/40" />
					</nuxt-link>
					<nuxt-link
						v-if="user"
						to="/account"
						class="sheet-row"
						@click="closeSheet"
					>
						<UIcon name="i-heroicons-user-circle" class="w-5 h-5" />
						<span class="flex-1">Account</span>
						<UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-muted-foreground/40" />
					</nuxt-link>
				</div>

				<!-- Dark mode + Logout -->
				<div class="ios-group mx-4 mb-6">
					<div class="sheet-row">
						<UIcon name="i-heroicons-moon" class="w-5 h-5" />
						<span class="flex-1">Dark Mode</span>
						<DarkModeToggle />
					</div>
					<template v-if="user">
						<a class="sheet-row cursor-pointer text-destructive" @click.prevent="handleLogout">
							<UIcon name="i-heroicons-arrow-right-start-on-rectangle" class="w-5 h-5" />
							<span class="flex-1">Sign Out</span>
						</a>
					</template>
					<nuxt-link v-else to="/auth/signin" class="sheet-row" @click="closeSheet">
						<UIcon name="i-heroicons-arrow-right-end-on-rectangle" class="w-5 h-5" />
						<span class="flex-1">Sign In</span>
					</nuxt-link>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup>
const route = useRoute();
const { user } = useDirectusAuth();
const { logout } = useLogout();
const { triggerHaptic } = useHaptic();
import { sheetOpen, closeSheet as closeSheetState } from '~~/composables/useScreen';

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});

const sheetRef = ref(null);
const dragOffset = ref(0);
let startY = 0;
let isDragging = false;

const isOpen = sheetOpen;

function closeSheet() {
	closeSheetState();
	dragOffset.value = 0;
}

function handleLogout() {
	closeSheet();
	logout();
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

	/* iOS sheet material */
	background: hsl(var(--card));
}

:is(.dark) .ios-sheet {
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
	padding: 10px 0 6px;
	cursor: grab;
}

.sheet-handle {
	width: 36px;
	height: 5px;
	border-radius: 3px;
	background: hsl(var(--muted-foreground) / 0.3);
}

.sheet-content {
	padding: 8px 0;
}

/* Row items — iOS settings style */
.sheet-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 13px 16px;
	font-size: 15px;
	font-weight: 400;
	color: hsl(var(--foreground));
	transition: background 0.15s ease;
	-webkit-tap-highlight-color: transparent;
	text-decoration: none;
}

.sheet-row:active {
	background: hsl(var(--muted) / 0.6);
}

.sheet-row-active {
	color: hsl(var(--primary));
	font-weight: 500;
}
</style>
