<script setup>
const { userPresence } = useUserPresence();
const config = useRuntimeConfig();

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${config.public.directusUrl}/assets/${user.avatar}?key=small`;
};

const userCount = computed(() => userPresence.value.length);
const userCountText = computed(() => `${userCount.value} other active ${userCount.value === 1 ? 'user' : 'users'}`);

// Auto-hide after 5 seconds of inactivity
const isVisible = ref(true);
const hideTimeout = ref(null);

const resetHideTimer = () => {
	if (hideTimeout.value) {
		clearTimeout(hideTimeout.value);
	}
	isVisible.value = true;
	hideTimeout.value = setTimeout(() => {
		isVisible.value = false;
	}, 5000);
};

// Reset timer when users change
watch(
	userPresence,
	() => {
		if (userCount.value > 0) {
			resetHideTimer();
		}
	},
	{ deep: true },
);

// Show on hover
const handleMouseEnter = () => {
	isVisible.value = true;
	if (hideTimeout.value) {
		clearTimeout(hideTimeout.value);
	}
};

const handleMouseLeave = () => {
	if (userCount.value > 0) {
		resetHideTimer();
	}
};

// Cleanup
onBeforeUnmount(() => {
	if (hideTimeout.value) {
		clearTimeout(hideTimeout.value);
	}
});
</script>

<template>
	<Transition
		enter-active-class="transition duration-300 ease-out"
		enter-from-class="transform -translate-y-4 opacity-0"
		enter-to-class="transform translate-y-0 opacity-100"
		leave-active-class="transition duration-200 ease-in"
		leave-from-class="transform translate-y-0 opacity-100"
		leave-to-class="transform -translate-y-4 opacity-0"
	>
		<div
			v-if="userCount > 0"
			class="fixed top-20 right-4 z-50 cursor-pointer"
			@mouseenter="handleMouseEnter"
			@mouseleave="handleMouseLeave"
		>
			<div
				class="bg-gray-50/90 dark:bg-gray-800/90 backdrop-blur-sm border border-[var(--cyan)] px-3 py-2 z-10"
				:class="{ 'opacity-30 hover:opacity-100': !isVisible }"
			>
				<div class="flex items-center gap-3 flex-col">
					<div class="flex flex-col">
						<h2 class="text-[10px] text-gray-500 min-w-[80px] uppercase mb-1">
							{{ userCountText }}
						</h2>
						<div
							v-for="presence in userPresence"
							:key="presence.user_id.id"
							class="flex flex-row items-center justify-center my-1"
						>
							<UAvatar
								:src="getAvatarUrl(presence.user_id)"
								:alt="`${presence.user_id.first_name} ${presence.user_id.last_name}`"
								size="xs"
								class="ring-2 ring-white dark:ring-gray-800 transition-transform"
							/>
							<h5 class="uppercase text-[9px] ml-1">
								{{ presence.user_id.first_name }} {{ presence.user_id.last_name }}
							</h5>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<style scoped>
/* .u-avatar {
	transition: all 0.2s ease;
}

.u-avatar:hover {
	z-index: 10;
} */
</style>
