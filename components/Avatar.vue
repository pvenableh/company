<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const config = useRuntimeConfig();
const { user } = useDirectusAuth();

const props = defineProps({
	chip: {
		type: Boolean,
		default: false,
	},
	text: {
		type: String,
		default: '',
	},
	size: {
		type: String,
		default: 'sm',
	},
	avatar: {
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

const avatarSource = ref('');

const initials = computed(() => {
	if (user.value) {
		const first = user.value.first_name?.[0] ?? '';
		const last = user.value.last_name?.[0] ?? '';
		return (first + last).toUpperCase();
	}
	return 'U';
});

watch(
	user,
	(newValue) => {
		if (props.avatar) {
			avatarSource.value = `${config.public.assetsUrl}${props.avatar}?key=avatar`;
		} else {
			if (newValue) {
				if (newValue.avatar) {
					avatarSource.value = `${config.public.assetsUrl}${newValue.avatar}?key=avatar`;
				} else {
					avatarSource.value = `https://ui-avatars.com/api/?name=${encodeURIComponent(newValue.first_name + ' ' + newValue.last_name)}&background=eeeeee&color=00bfff`;
				}
			} else {
				avatarSource.value = 'https://ui-avatars.com/api/?name=Unknown%20User&background=eeeeee&color=00bfff';
			}
		}
	},
	{
		immediate: true,
	},
);
</script>

<template>
	<div v-if="chip" class="relative inline-block">
		<Avatar :class="sizeClasses[size] || sizeClasses['sm']">
			<AvatarImage :src="avatarSource" :alt="user?.first_name + ' ' + user?.last_name" />
			<AvatarFallback>{{ initials }}</AvatarFallback>
		</Avatar>
		<span
			class="absolute top-0 right-0 flex items-center justify-center rounded-full bg-sky-500 text-white text-[10px] leading-none size-4"
		>
			{{ text }}
		</span>
	</div>
	<Avatar v-else :class="sizeClasses[size] || sizeClasses['sm']">
		<AvatarImage :src="avatarSource" :alt="user?.first_name + ' ' + user?.last_name" />
		<AvatarFallback>{{ initials }}</AvatarFallback>
	</Avatar>
</template>
