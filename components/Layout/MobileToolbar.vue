<script setup>
import { toggleSheet } from '~~/composables/useScreen';

const route = useRoute();
const { triggerHaptic } = useHaptic();

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});

const emit = defineEmits(['open-ai']);

const leftLinks = computed(() => {
	const half = Math.ceil(props.links.length / 2);
	return props.links.slice(0, half);
});

const rightLinks = computed(() => {
	const half = Math.ceil(props.links.length / 2);
	return props.links.slice(half);
});

// Short names for toolbar display (keeps canonical names intact elsewhere)
const shortNames = { 'Command Center': 'Commander' };
const displayName = (link) => shortNames[link.name] || link.name;

const handleNavigation = (link) => {
	triggerHaptic(10);
};

const handleAI = () => {
	triggerHaptic(10);
	emit('open-ai');
};
</script>
<template>
	<nav class="ios-tab-bar md:hidden" role="tablist">
		<!-- Left nav links -->
		<nuxt-link
			v-for="(link, index) in leftLinks"
			:key="'l' + index"
			:to="link.to"
			role="tab"
			class="ios-tab-item"
			:class="[
				{ active: route.path === link.to },
				index >= 2 ? 'hidden sm:flex' : '',
			]"
			@click="handleNavigation(link)"
		>
			<div class="ios-tab-icon-wrap">
				<UIcon :name="link.icon" class="ios-tab-icon" />
			</div>
			<span class="ios-tab-label">{{ displayName(link) }}</span>
		</nuxt-link>

		<!-- AI Assistant center button -->
		<button class="ios-tab-item ios-tab-ai" @click="handleAI">
			<div class="ios-tab-ai-btn">
				<UIcon name="i-heroicons-sparkles" class="ios-tab-ai-icon" />
			</div>
			<span class="ios-tab-label">AI</span>
		</button>

		<!-- Right nav links -->
		<nuxt-link
			v-for="(link, index) in rightLinks"
			:key="'r' + index"
			:to="link.to"
			role="tab"
			class="ios-tab-item"
			:class="[
				{ active: route.path === link.to },
				index >= 1 ? 'hidden sm:flex' : '',
			]"
			@click="handleNavigation(link)"
		>
			<div class="ios-tab-icon-wrap">
				<UIcon :name="link.icon" class="ios-tab-icon" />
			</div>
			<span class="ios-tab-label">{{ displayName(link) }}</span>
		</nuxt-link>

		<!-- Menu button -->
		<button
			class="ios-tab-item"
			@click="() => { triggerHaptic(10); toggleSheet(); }"
		>
			<div class="ios-tab-icon-wrap">
				<UIcon name="i-heroicons-bars-3" class="ios-tab-icon" />
			</div>
			<span class="ios-tab-label">Menu</span>
		</button>
	</nav>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ios-tab-bar {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 40;
	display: flex;
	align-items: flex-end;
	justify-content: space-around;
	height: calc(56px + env(safe-area-inset-bottom, 0px));
	padding-top: 4px;
	padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
	border-top: 0.5px solid hsl(var(--border) / 0.5);

	/* iOS frosted glass */
	background: rgba(255, 255, 255, 0.78);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
}

:is(.dark) .ios-tab-bar {
	background: rgba(20, 20, 20, 0.78);
	border-top-color: rgba(255, 255, 255, 0.08);
}

.ios-tab-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	flex: 1;
	height: 48px;
	gap: 2px;
	color: hsl(var(--muted-foreground));
	transition: color 0.2s ease;
	-webkit-tap-highlight-color: transparent;
	cursor: pointer;
	background: none;
	border: none;
	padding: 0;
}

.ios-tab-item.active,
.ios-tab-item.router-link-exact-active {
	color: hsl(var(--primary));
}

.ios-tab-icon-wrap {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.ios-tab-item:active .ios-tab-icon-wrap {
	transform: scale(0.82);
}

.ios-tab-icon {
	width: 18px;
	height: 18px;
}

.ios-tab-label {
	font-size: 10px;
	font-weight: 500;
	letter-spacing: 0.04em;
	line-height: 1;
	text-transform: uppercase;
}

/* AI center button — raised circle overflowing top */
.ios-tab-ai {
	position: relative;
}

.ios-tab-ai-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 44px;
	height: 44px;
	border-radius: 50%;
	background: hsl(var(--primary));
	color: hsl(var(--primary-foreground));
	transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
	box-shadow: 0 2px 12px hsl(var(--primary) / 0.35);
	margin-top: -10px;
}

.ios-tab-ai:active .ios-tab-ai-btn {
	transform: scale(0.88);
}

.ios-tab-ai-icon {
	width: 18px;
	height: 18px;
}

.ios-tab-ai .ios-tab-label {
	color: hsl(var(--primary));
	margin-top: 1px;
}
</style>
