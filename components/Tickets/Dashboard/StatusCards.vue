<template>
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <UCard class="border-l-4 border-[var(--cyan)]">
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-xs uppercase font-bold text-gray-500">Pending</h3>
          <p class="text-2xl font-bold">{{ ticketCounts.pending }}</p>
        </div>
        <UIcon name="i-heroicons-clock" class="w-10 h-10 text-gray-300" />
      </div>
      <p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.pending) }}</p>
    </UCard>

    <UCard class="border-l-4 border-[var(--cyan2)]">
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-xs uppercase font-bold text-gray-500">Scheduled</h3>
          <p class="text-2xl font-bold">{{ ticketCounts.scheduled }}</p>
        </div>
        <UIcon name="i-heroicons-calendar" class="w-10 h-10 text-gray-300" />
      </div>
      <p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.scheduled) }}</p>
    </UCard>

    <UCard class="border-l-4 border-[var(--green2)]">
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-xs uppercase font-bold text-gray-500">In Progress</h3>
          <p class="text-2xl font-bold">{{ ticketCounts.inProgress }}</p>
        </div>
        <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 text-gray-300" />
      </div>
      <p class="text-xs mt-2">Avg. age: {{ formatDuration(avgTicketAge.inProgress) }}</p>
    </UCard>

    <UCard class="border-l-4 border-[var(--green)]">
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-xs uppercase font-bold text-gray-500">Completed</h3>
          <p class="text-2xl font-bold">{{ ticketCounts.completed }}</p>
        </div>
        <UIcon name="i-heroicons-check-circle" class="w-10 h-10 text-gray-300" />
      </div>
      <p class="text-xs mt-2">Last 30 days: {{ ticketCounts.recentlyCompleted }}</p>
    </UCard>
  </div>
</template>

<script setup>
const props = defineProps({
  ticketCounts: {
    type: Object,
    required: true
  },
  avgTicketAge: {
    type: Object,
    required: true
  }
});

// Format duration for display (copied from parent component)
const formatDuration = (hours) => {
  if (hours === 0) return 'N/A';

  if (hours < 24) {
    return `${Math.round(hours)}h`;
  } else {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
};
</script>