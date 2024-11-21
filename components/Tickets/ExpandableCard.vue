<template>
	<div ref="cardRef" class="w-full relative flex flex-col lg:flex-row flex-wrap items-center justify-center">
		<!-- Card Preview -->
		<div class="w-full cursor-pointer transition-transform duration-300" :class="{ 'pointer-events-none': isExpanded }">
			<TicketsCard
				:element="element"
				@expand="expand"
				:comment-count="element.comments.length"
				:task-count="element.tasks.length"
			/>
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
					class="fixed inset-0 bg-white dark:bg-gray-800 z-[50] overflow-auto"
					@click.self="collapse"
				>
					<div class="container mx-auto">
						<!-- Header -->
						<div class="sticky top-0 z-[10000] bg-white dark:bg-gray-800 border-b dark:border-gray-700">
							<div class="flex items-center justify-between">
								<div class="flex flex-col items-start">
									<p class="text-xs text-gray-500 uppercase">
										<span class="opacity-50 mr-1">Ticket #:</span>
										{{ element?.id }}
									</p>
									<p class="text-xs text-gray-500 uppercase">
										<span class="opacity-50 mr-1">Client:</span>
										{{ element?.organization.name }}
									</p>
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
const { triggerRefresh } = useTicketsStore();

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
	triggerRefresh();
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
