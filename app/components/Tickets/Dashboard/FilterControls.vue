<template>
  <div class="flex flex-wrap gap-4 items-center mb-6">
    <div class="flex-grow">
      <UFormGroup label="Time Period">
        <USelect 
          :model-value="timePeriod" 
          :options="timePeriodOptions" 
          @update:model-value="updateTimePeriod"
        />
      </UFormGroup>
    </div>
    <div v-if="showTeamFilter" class="flex-grow">
      <UFormGroup label="Team Filter">
        <USelect 
          :model-value="teamFilter" 
          :options="teamOptions" 
          @update:model-value="updateTeamFilter"
        />
      </UFormGroup>
    </div>
    <div class="flex-grow">
      <UFormGroup label="Your Tickets Only">
        <UToggle 
          :model-value="showOnlyMyTickets"
          @update:model-value="updateShowOnlyMyTickets"
        />
      </UFormGroup>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  timePeriod: {
    type: String,
    required: true
  },
  teamFilter: {
    type: String,
    default: null
  },
  showOnlyMyTickets: {
    type: Boolean,
    default: false
  },
  timePeriodOptions: {
    type: Array,
    required: true
  },
  teamOptions: {
    type: Array,
    required: true
  },
  showTeamFilter: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits([
  'update:timePeriod', 
  'update:teamFilter', 
  'update:showOnlyMyTickets',
  'change'
]);

const updateTimePeriod = (value) => {
  emit('update:timePeriod', value);
  emit('change');
};

const updateTeamFilter = (value) => {
  emit('update:teamFilter', value);
  emit('change');
};

const updateShowOnlyMyTickets = (value) => {
  emit('update:showOnlyMyTickets', value);
  emit('change');
};
</script>