<template>
	<component
		:is="to ? resolveComponent('NuxtLink') : href ? 'a' : 'div'"
		:to="to"
		:href="href"
		class="ios-list-item"
		:class="{ 'ios-list-item-link': to || href || clickable }"
		@click="$emit('click', $event)"
	>
		<div v-if="$slots.media" class="ios-list-item-media">
			<slot name="media" />
		</div>
		<div class="ios-list-item-inner">
			<div class="ios-list-item-content">
				<div class="ios-list-item-title">
					<slot>{{ title }}</slot>
				</div>
				<div v-if="subtitle || $slots.subtitle" class="ios-list-item-subtitle">
					<slot name="subtitle">{{ subtitle }}</slot>
				</div>
			</div>
			<div v-if="$slots.after || after" class="ios-list-item-after">
				<slot name="after">
					<span class="ios-list-item-after-text">{{ after }}</span>
				</slot>
			</div>
			<UIcon
				v-if="to || href || chevron"
				name="i-heroicons-chevron-right"
				class="ios-list-item-chevron"
			/>
		</div>
	</component>
</template>

<script setup lang="ts">
defineProps<{
	title?: string;
	subtitle?: string;
	after?: string;
	to?: string;
	href?: string;
	chevron?: boolean;
	clickable?: boolean;
}>();

defineEmits(['click']);
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ios-list-item {
	display: flex;
	align-items: center;
	min-height: 44px;
	padding-left: 16px;
	text-decoration: none;
	color: inherit;
	-webkit-tap-highlight-color: transparent;
}

.ios-list-item-link {
	cursor: pointer;
	transition: background 0.12s ease;
}

.ios-list-item-link:active {
	background: hsl(var(--muted) / 0.5);
}

.ios-list-item + .ios-list-item {
	border: none;
}

.ios-list-item-media {
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: 12px;
	flex-shrink: 0;
}

.ios-list-item-inner {
	display: flex;
	align-items: center;
	flex: 1;
	min-height: 44px;
	padding: 10px 16px 10px 0;
	border-bottom: 0.5px solid hsl(var(--border) / 0.4);
}

.ios-list-item:last-child .ios-list-item-inner {
	border-bottom: none;
}

.ios-list-item-content {
	flex: 1;
	min-width: 0;
}

.ios-list-item-title {
	font-size: 17px;
	line-height: 1.3;
	color: hsl(var(--foreground));
}

.ios-list-item-subtitle {
	font-size: 13px;
	line-height: 1.3;
	color: hsl(var(--muted-foreground));
	margin-top: 1px;
}

.ios-list-item-after {
	margin-left: 8px;
	flex-shrink: 0;
}

.ios-list-item-after-text {
	font-size: 15px;
	color: hsl(var(--muted-foreground));
}

.ios-list-item-chevron {
	width: 16px;
	height: 16px;
	margin-left: 4px;
	color: hsl(var(--muted-foreground) / 0.4);
	flex-shrink: 0;
}
</style>
