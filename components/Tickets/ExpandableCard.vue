<template>
	<div ref="cardRef" class="relative">
		<!-- Card Preview -->
		<div class="cursor-pointer transition-transform duration-300" :class="{ 'pointer-events-none': isExpanded }">
			<TicketsCard :element="element" @expand="expand" />
		</div>

		<!-- Teleported Fullscreen Overlay -->
		<Teleport to="body">
			<Transition
				enter-active-class="transition duration-300 ease-out"
				enter-from-class="opacity-0 scale-95"
				enter-to-class="opacity-100 scale-100"
				leave-active-class="transition duration-200 ease-in"
				leave-from-class="opacity-100 scale-100"
				leave-to-class="opacity-0 scale-95"
			>
				<div
					v-if="isExpanded"
					class="fixed inset-0 bg-white dark:bg-gray-800 z-[9999] overflow-auto"
					@click.self="collapse"
				>
					<div class="container mx-auto">
						<!-- Header -->
						<div class="sticky top-0 z-[10000] bg-white dark:bg-gray-800 border-b dark:border-gray-700">
							<div class="flex items-center justify-between">
								<div class="flex items-center">
									<span class="text-xs text-gray-500 uppercase">Ticket #{{ element?.id }}</span>
									<!-- <h3 class="text-lg font-semibold">{{ element?.title }}</h3> -->
								</div>
								<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" @click="collapse" />
							</div>
						</div>

						<!-- Content -->
						<div class="mt-4">
							<TicketsDetails
								v-if="element"
								:element="element"
								:columns="columns"
								:is-loading="updatingTickets?.has(element.id)"
							/>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>
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

const cardRef = ref(null);
const isExpanded = ref(false);

const expand = () => {
	isExpanded.value = true;
	document.body.style.overflow = 'hidden';
};

const collapse = () => {
	isExpanded.value = false;
	document.body.style.overflow = '';
};

onMounted(() => {
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && isExpanded.value) {
			collapse();
		}
	});
});

onUnmounted(() => {
	document.body.style.overflow = '';
});
</script>
