<script setup lang="ts">
/**
 * UserPresenceIndicator — Green/gray dot showing user online status.
 *
 * Usage:
 *   <UserPresenceIndicator :user-id="user.id" />
 *   <UserPresenceIndicator :user-id="user.id" size="lg" />
 *   <UserPresenceIndicator :user-id="user.id" show-label />
 */

const props = withDefaults(
  defineProps<{
    userId: string;
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
  }>(),
  {
    size: 'md',
    showLabel: false,
  },
);

const { isOnline } = usePresence();

const online = computed(() => isOnline(props.userId));

const dotSize = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-2 h-2';
    case 'lg': return 'w-3.5 h-3.5';
    default: return 'w-2.5 h-2.5';
  }
});

const ringSize = computed(() => {
  switch (props.size) {
    case 'sm': return 'ring-1';
    case 'lg': return 'ring-[2px]';
    default: return 'ring-[1.5px]';
  }
});
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span
      :class="[
        dotSize,
        ringSize,
        'rounded-full ring-background flex-shrink-0 transition-colors duration-300',
        online ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600',
      ]"
      :title="online ? 'Online' : 'Offline'"
    />
    <span
      v-if="showLabel"
      class="text-xs"
      :class="online ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'"
    >
      {{ online ? 'Online' : 'Offline' }}
    </span>
  </span>
</template>
