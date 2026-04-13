<template>
  <div>
    <form @submit.prevent="createChannel" class="flex items-end gap-2">
      <div class="flex-1 min-w-0">
        <label class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Channel name</label>
        <input
          v-model="channelName"
          type="text"
          placeholder="e.g. design-feedback"
          :disabled="isLoading"
          class="w-full h-8 rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <p v-if="channelName && !isValidChannelName" class="text-[10px] text-red-500 mt-0.5">
          At least 3 characters required.
        </p>
      </div>
      <button
        type="submit"
        :disabled="isLoading || !isValidChannelName"
        class="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        {{ isLoading ? 'Creating...' : 'Create' }}
      </button>
    </form>
    <p v-if="successMessage" class="text-[10px] text-emerald-600 mt-1.5">{{ successMessage }}</p>
    <p v-if="errorMessage" class="text-[10px] text-red-500 mt-1.5">{{ errorMessage }}</p>
  </div>
</template>

<script setup>
const props = defineProps({
  project: {
    type: Object,
    default: () => null,
  },
});

const channelName = ref('');
const channelSlug = computed(() => slugify(channelName.value));
const isLoading = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const channelItems = useDirectusItems('channels');

const isValidChannelName = computed(() => channelName.value.length >= 3);

const createChannel = async () => {
  if (!isValidChannelName.value) return;

  isLoading.value = true;
  successMessage.value = '';
  errorMessage.value = '';

  try {
    const data = {
      name: channelSlug.value,
      status: 'published',
    };
    if (props.project?.id) data.project = props.project.id;
    if (props.project?.organization?.id) data.organization = props.project.organization.id;
    if (props.project?.client) data.client = typeof props.project.client === 'object' ? props.project.client.id : props.project.client;
    await channelItems.create(data);

    successMessage.value = `Channel "${channelName.value}" created.`;
    channelName.value = '';
  } catch (error) {
    console.error('Error creating channel:', error);
    errorMessage.value = 'Failed to create channel. Please try again.';
  } finally {
    isLoading.value = false;
  }
};
</script>
