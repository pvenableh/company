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

const cancelEdit = () => {
	isEditing.value = false;
	email.value = props.defaultEmail;
};
</script>

<template>
	<UCard>
		<template #header>
			<h5>Confirm Your Information</h5>
		</template>
		<div>
			<p class="text-sm text-gray-500 mb-4">Please confirm your email address to continue with the payment:</p>
			<div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4 h-16">
				<div v-if="!isEditing">
					<div class="flex items-start gap-2">
						<UInput
							v-model="email"
							type="email"
							required
							placeholder="your@email.com"
							autofocus
							class="flex-grow"
							readonly
						/>
						<UButton color="gray" variant="ghost" size="sm" @click="isEditing = true">Edit</UButton>
					</div>
				</div>

				<div v-else>
					<div class="flex items-start gap-2">
						<UInput v-model="email" type="email" required placeholder="your@email.com" autofocus class="flex-grow" />
						<UButton color="gray" variant="soft" size="sm" @click="cancelEdit">Cancel</UButton>
					</div>
				</div>
			</div>
			<UButton type="submit" block :loading="isLoading" @click="handleSubmit">Continue to Payment</UButton>
		</div>
	</UCard>
</template>
