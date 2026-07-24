<template>
  <div class="flex flex-wrap gap-4 items-center mb-6">
    <div class="flex-grow">
      <EFormGroup label="Time Period">
        <ESelect 
          :model-value="timePeriod" 
          :options="timePeriodOptions" 
          @update:model-value="updateTimePeriod"
        />
      </EFormGroup>
    </div>
    <div v-if="showTeamFilter" class="flex-grow">
      <EFormGroup label="Team Filter">
        <ESelect 
          :model-value="teamFilter" 
          :options="teamOptions" 
          @update:model-value="updateTeamFilter"
        />
      </EFormGroup>
    </div>
    <div class="flex-grow">
      <EFormGroup label="Your Tickets Only">
        <EToggle 
          :model-value="showOnlyMyTickets"
          @update:model-value="updateShowOnlyMyTickets"
        />
      </EFormGroup>
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