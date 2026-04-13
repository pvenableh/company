<script setup>
const props = defineProps({
  project: {
    type: Object,
    default: () => null,
  },
});

const {
  data: channels,
  isLoading: channelsLoading,
  error: channelsError,
  isConnected: channelsConnected,
  refresh: refreshChannels,
} = useRealtimeSubscription('channels', ['id', 'name', 'messages'], {
  project: { _eq: props.project.id },
});

const isFullyConnected = computed(() => channelsConnected.value);
const isLoading = computed(() => channelsLoading.value);
const hasError = computed(() => channelsError.value);

const showCreateForm = ref(false);

const refreshAll = () => {
  refreshChannels();
};
</script>

<template>
  <div class="w-full space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Channels</span>
        <span v-if="channels?.length" class="text-[10px] text-muted-foreground/60">{{ channels.length }}</span>
      </div>
      <button
        class="text-[10px] font-medium text-primary hover:underline uppercase tracking-wide"
        @click="showCreateForm = !showCreateForm"
      >
        {{ showCreateForm ? 'Cancel' : '+ New Channel' }}
      </button>
    </div>

    <!-- Connection warning -->
    <div v-if="!isFullyConnected && !isLoading" class="ios-card p-3 flex items-center gap-2 border-amber-200 dark:border-amber-800">
      <div class="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
        <Icon name="lucide:wifi-off" class="w-3.5 h-3.5 text-amber-500" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-foreground">Connection lost</p>
        <p class="text-[10px] text-muted-foreground">Attempting to reconnect...</p>
      </div>
      <button class="text-[10px] text-primary hover:underline shrink-0" @click="refreshAll">Retry</button>
    </div>

    <!-- Error -->
    <div v-if="hasError" class="ios-card p-3 flex items-center gap-2 border-red-200 dark:border-red-800">
      <div class="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
        <Icon name="lucide:alert-circle" class="w-3.5 h-3.5 text-red-500" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-foreground">Failed to load channels</p>
      </div>
      <button class="text-[10px] text-primary hover:underline shrink-0" @click="refreshAll">Retry</button>
    </div>

    <!-- Create channel form (inline, compact) -->
    <div v-if="showCreateForm" class="ios-card p-4">
      <SlackCreate :project="project" />
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div v-for="n in 3" :key="n" class="ios-card p-4 animate-pulse">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-muted/60" />
          <div class="space-y-1.5 flex-1">
            <div class="h-3 w-24 bg-muted/60 rounded" />
            <div class="h-2.5 w-16 bg-muted/40 rounded" />
          </div>
        </div>
      </div>
    </div>

    <!-- Channels grid -->
    <div v-else-if="channels?.length" class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <NuxtLink
        v-for="item in channels"
        :key="item.name"
        :to="'/channels/' + item.name"
        class="ios-card p-4 flex items-center justify-between ios-press"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
            <Icon name="lucide:hash" class="w-4 h-4 text-violet-500" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-foreground truncate">{{ item.name }}</p>
            <p class="text-[10px] text-muted-foreground">{{ item.messages?.length || 0 }} messages</p>
          </div>
        </div>
        <Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40 shrink-0" />
      </NuxtLink>
    </div>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center justify-center py-16 text-center">
      <div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
        <Icon name="lucide:message-circle" class="h-6 w-6 text-muted-foreground/60" />
      </div>
      <p class="text-sm text-muted-foreground">No channels for this project.</p>
      <button
        class="mt-3 text-xs text-primary hover:underline"
        @click="showCreateForm = true"
      >
        Create the first channel
      </button>
    </div>
  </div>
</template>
