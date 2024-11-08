<template>
	<div ref="cardRef" class="relative">
		<!-- Card Preview -->
		<div class="cursor-pointer" @click="isExpanded = true">
			<TicketsCard :element="element" />
		</div>

		<!-- Modal -->
		<UModal v-model="isExpanded">
			<UCard>
				<!-- Header -->
				<template #header>
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-3">
							<span class="text-sm text-gray-500">{{ element?.id }}</span>
							<h3 class="text-lg font-semibold">{{ element?.title }}</h3>
						</div>
					</div>
				</template>

				<!-- Content -->
				<TicketsDetails
					v-if="element"
					:element="element"
					:columns="columns"
					:is-loading="updatingTickets?.has(element.id)"
				/>
			</UCard>
		</UModal>
	</div>
</template>

<script setup>
const props = defineProps({
	element: {
		type: Object,
		required: true,
	},
	columns: {
		type: Array,
		required: true,
	},
	updatingTickets: {
		type: Set,
		required: true,
	},
});

const isExpanded = ref(false);

// Close on escape key
onMounted(() => {
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && isExpanded.value) {
			isExpanded.value = false;
		}
	});
});
</script>
