<!-- components/AnonymousUserForm.vue -->
<script setup>
const props = defineProps({
	defaultEmail: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['submit']);
const isLoading = ref(false);
const isEditing = ref(false);
const email = ref(props.defaultEmail);

const handleSubmit = async () => {
	isLoading.value = true;
	try {
		await emit('submit', {
			email: email.value,
		});
	} finally {
		isLoading.value = false;
	}
};
</script>

<template>
	<UCard>
		<UCardHeader>
			<UCardTitle>Confirm Your Information</UCardTitle>
		</UCardHeader>
		<UCardContent>
			<p class="text-sm text-gray-500 mb-4">Please confirm your email address to continue with the payment:</p>

			<div v-if="!isEditing" class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
				<div class="flex items-center justify-between">
					<p class="font-medium">{{ email }}</p>
					<UButton color="gray" variant="ghost" size="xs" @click="isEditing = true">Edit</UButton>
				</div>
			</div>

			<form v-else @submit.prevent="handleSubmit" class="mb-4">
				<UFormGroup>
					<UInput v-model="email" type="email" required placeholder="your@email.com" autofocus>
						<template #trailing>
							<UButton color="gray" variant="ghost" size="xs" @click="isEditing = false">Cancel</UButton>
						</template>
					</UInput>
				</UFormGroup>
			</form>

			<UButton type="submit" block :loading="isLoading" @click="handleSubmit">Continue to Payment</UButton>
		</UCardContent>
	</UCard>
</template>
