<script setup>
const props = defineProps({
  defaultEmail: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['submit']);

const form = ref({
  email: props.defaultEmail,
  firstName: '',
  lastName: ''
});

const isLoading = ref(false);

const handleSubmit = async () => {
  isLoading.value = true;
  try {
    await emit('submit', {
      email: form.value.email,
      firstName: form.value.firstName,
      lastName: form.value.lastName
    });
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <UCard>
    <UCardHeader>
      <UCardTitle>Your Information</UCardTitle>
      <p class="text-sm text-gray-500">Please provide your details to continue</p>
    </UCardHeader>
    <UCardContent>
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <UFormGroup label="Email">
          <UInput
            v-model="form.email"
            type="email"
            required
            placeholder="your@email.com"
          />
        </UFormGroup>
        
        <UFormGroup label="First Name">
          <UInput
            v-model="form.firstName"
            required
            placeholder="First Name"
          />
        </UFormGroup>
        
        <UFormGroup label="Last Name">
          <UInput
            v-model="form.lastName"
            required
            placeholder="Last Name"
          />
        </UFormGroup>

        <UButton
          type="submit"
          block
          :loading="isLoading"
        >
          Continue to Payment
        </UButton>
      </form>
    </UCardContent>
  </UCard>
</template>