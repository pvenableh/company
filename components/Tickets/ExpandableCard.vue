<template>
	<div ref="cardRef" class="w-full relative flex flex-col lg:flex-row flex-wrap items-center justify-center">
		<!-- Card Preview -->
		<div class="w-full cursor-pointer transition-transform duration-300" :class="{ 'pointer-events-none': isExpanded }">
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
					class="fixed inset-0 backdrop-blur-lg bg-white dark:bg-gray-800 bg-opacity-75 z-[50] overflow-auto"
					@click.self="collapse"
				>
					<div
						class="container mx-auto relative max-w-screen-xl flex items-center justify-center flex-wrap flex-col min-h-full"
					>
						<!-- Header -->
						<div class="w-full sticky pb-6 top-10 z-10 flex items-end justify-end">
							<UButton
								color="gray"
								variant="solid"
								icon="i-heroicons-x-mark-20-solid"
								@click="collapse"
								:ui="{ rounded: 'rounded-full' }"
								class=""
							/>
						</div>
						<!-- Content -->

						<TicketsDetails
							v-if="element"
							:element="element"
							:columns="columns"
							:is-loading="updatingTickets?.has(element.id)"
							@prevent-close="handlePreventClose"
						/>
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
if (props.element.comments.length) {
	console.log('Comments:', props.element.comments);
}

// Use computed properties instead of refs to keep values reactive
const commentsCount = computed(() => {
	// If commentsCount is explicitly set, use it
	if (typeof props.element.commentsCount === 'number') {
		return props.element.commentsCount;
	}

	// If comments is a number, return it directly
	if (typeof props.element.comments === 'number') {
		return props.element.comments;
	}

	// If comments is an array, return its length
	if (Array.isArray(props.element.comments)) {
		return props.element.comments.length;
	}

	// Default to 0 if undefined or null
	return 0;
});

const tasksCount = computed(() => {
	// If tasks is an array, return its length
	if (Array.isArray(props.element.tasks)) {
		return props.element.tasks.length;
	}
	// If tasks is already a number, return it directly
	if (typeof props.element.tasks === 'number') {
		return props.element.tasks;
	}
	// Default to 0 if undefined or null
	return 0;
});

const cardRef = ref(null);
const isExpanded = ref(false);
const canClose = ref(true);

const expand = () => {
	isExpanded.value = true;
	document.body.style.overflow = 'hidden';
};

const collapse = () => {
	if (!canClose.value) {
		return;
	}
	isExpanded.value = false;
	document.body.style.overflow = '';
	triggerRefresh();
};

const handlePreventClose = (prevented) => {
	canClose.value = !prevented;
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
