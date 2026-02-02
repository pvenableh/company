<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const props = defineProps({
	src: {
		type: String,
		default: null,
	},
	alt: {
		type: String,
		default: '',
	},
	size: {
		type: String,
		default: 'sm',
	},
	icon: {
		type: String,
		default: null,
	},
});

const sizeClasses: Record<string, string> = {
	'3xs': 'size-4 text-[8px]',
	'2xs': 'size-5 text-[10px]',
	xs: 'size-6 text-xs',
	sm: 'size-8 text-sm',
	md: 'size-10 text-base',
	lg: 'size-12 text-lg',
	xl: 'size-14 text-xl',
	'2xl': 'size-16 text-2xl',
	'3xl': 'size-20 text-3xl',
};

const initials = computed(() => {
	if (!props.alt) return '';
	return props.alt
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
});
</script>

<template>
	<Avatar :class="sizeClasses[size] || sizeClasses['sm']">
		<AvatarImage v-if="src" :src="src" :alt="alt" />
		<AvatarFallback v-if="$slots.fallback || icon || !src">
			<slot name="fallback">
				<UIcon v-if="icon" :name="icon" class="size-1/2" />
				<span v-else>{{ initials }}</span>
			</slot>
		</AvatarFallback>
	</Avatar>
</template>
